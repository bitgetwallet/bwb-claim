//! A program for distributing tokens efficiently via uploading a [Merkle root](https://en.wikipedia.org/wiki/Merkle_tree).
//!
//! This program is largely based off of [Uniswap's Merkle Distributor](https://github.com/Uniswap/merkle-distributor).
//!
//! # Rationale
//!
//! Although Solana has low fees for executing transactions, it requires staking tokens to pay for storage costs, also known as "rent". These rent costs can add up when sending tokens to thousands or tens of thousands of wallets, making it economically unreasonable to distribute tokens to everyone.
//!
//! The Merkle distributor, pioneered by [Uniswap](https://github.com/Uniswap/merkle-distributor), solves this issue by deriving a 256-bit "root hash" from a tree of balances. This puts the gas cost on the claimer. Solana has the additional advantage of being able to reclaim rent from closed token accounts, so the net cost to the user should be around `0.000010 SOL` (at the time of writing).
//!
//! The Merkle distributor is also significantly easier to manage from an operations perspective, since one does not need to send a transaction to each individual address that may be redeeming tokens.
//!
//! # License
//!
//! The Merkle distributor program and SDK is distributed under the GPL v3.0 license.

#![allow(clippy::too_many_arguments)]
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

use solana_program::instruction::Instruction;
use solana_program::sysvar::instructions::{ID as IX_ID, load_instruction_at_checked};

use crate::error::ErrorCode;

pub mod merkle_proof;
pub mod utils;
pub mod error;

// pub mod multi_merkle_tree;
// pub use multi_merkle_tree::*;


declare_id!("zoat5xwp6Cg35z7SVmMCagw64PHrfAoGDCE7QBzvtiH");

/// The [multi_merkle_distributor] program.
#[program]
pub mod multi_merkle_distributor {

    use super::*;

    /// Creates a new [MerkleDistributor].
    /// After creating this [MerkleDistributor], the account should be seeded with tokens via its ATA.
    #[allow(clippy::result_large_err)]
    pub fn new_distributor(
        ctx: Context<NewDistributor>,
        max_total_claim: u64,
        max_num_nodes: u64,
        start_timestamp: i64,
        cosigner: Pubkey,
        admin_auth: Pubkey,
        receiver: Pubkey,
        operator: Pubkey,
    ) -> Result<()> {
        let distributor = &mut ctx.accounts.distributor;

        distributor.cosigner = cosigner;
        distributor.admin_auth = admin_auth;
        distributor.receiver = receiver;
        distributor.operator = operator;
        
        distributor.bump = ctx.bumps.distributor;
        distributor.mint = ctx.accounts.mint.key();


        distributor.max_total_claim = max_total_claim;
        distributor.max_num_nodes = max_num_nodes;
        distributor.total_amount_claimed = 0;
        distributor.num_nodes_claimed = 0;
        distributor.claim_start_at = start_timestamp;

        Ok(())
    }

    #[allow(clippy::result_large_err)]
    pub fn init_merkle_roots(
        ctx: Context<InitMerkleRoots>,
        account_index:u64,
        roots: [MerkleRoot; 20]
    ) -> Result<()> {
        let merkle_roots_account = &mut ctx.accounts.merkle_roots;
        merkle_roots_account.roots = roots;

        let distributor = &mut ctx.accounts.distributor;
        distributor.roots_accounts[account_index as usize] = merkle_roots_account.key();

        Ok(())
    }


    /// Claims tokens from the [MerkleDistributor].
    #[allow(clippy::result_large_err)]
    pub fn claim(
        ctx: Context<Claim>,
        evm_claimer:[u8;20],
        account_index: u64,
        roots_index: u64,

        index: u64,
        amount: u64,
        proof: Vec<[u8; 32]>,

        msg: Vec<u8>, sig: [u8; 64], recovery_id: u8
    ) -> Result<()> {
        let account = &ctx.accounts.distributor;
        require!(!account.is_paused, ErrorCode::ProtocolPaused);
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= account.claim_start_at , ErrorCode::TooEarlyToClaim);

        let claim_status = &mut ctx.accounts.claim_status;// user => claim_status PDA
        require!(claim_status.claimed_amount == 0, ErrorCode::AlreadyClaimed);

        let distributor = &ctx.accounts.distributor;// init status and vault'owner

        require!(
            ctx.accounts.payer.key() != distributor.admin_auth,
            ErrorCode::Unauthorized
        );

        // Verify the EVM Sign.
        // Get what should be the Secp256k1Program instruction
        let ix: Instruction = load_instruction_at_checked(0, &ctx.accounts.ix_sysvar)?;

        // Check that ix is what we expect to have been sent
        utils::verify_secp256k1_ix(&ix, &evm_claimer, &msg, &sig, recovery_id)?;

        let to_ata = ctx.accounts.to_token_account.key();
        let to_ata_bytes = to_ata.to_bytes();
        // create msg "Authorize BWB claim:${receivAddress}\n\n"
        let prefix_msg = b"Authorize BWB claim:";
        let middle_msg = b"\n\n";
        // equal Solidity Keccak256 hash
        let keccak256_hash = anchor_lang::solana_program::keccak::hashv(&[&to_ata_bytes,&amount.to_le_bytes()]);
        // Construct actual_message
        let mut actual_message: Vec<u8> = Vec::new();
        actual_message.extend_from_slice(b"\x19Ethereum Signed Message:\n98");
        actual_message.extend_from_slice(prefix_msg);
        actual_message.extend_from_slice(&ctx.accounts.to_token_account.owner.key().to_string().into_bytes());
        actual_message.extend_from_slice(middle_msg);
        actual_message.extend_from_slice(&keccak256_hash.as_ref());

        // check token to_ata is evm_calimer points
        require!(actual_message == msg, ErrorCode::InvaildReceipentATA);       


        // Verify the merkle proof.
        let node = anchor_lang::solana_program::keccak::hashv(&[
            &index.to_le_bytes(),
            &evm_claimer,
            &amount.to_le_bytes(),
        ]);
        msg!("node hash is {:?}", node);

        let roots_account = &ctx.accounts.merkle_roots;

        require!(
            merkle_proof::verify(proof, roots_account.roots[roots_index as usize].root, node.0),
            ErrorCode::InvalidProof
        );

        // Mark it claimed and send the tokens.
        claim_status.claimed_amount = amount;
    
        claim_status.claimed_at = clock.unix_timestamp;
        claim_status.claimant = ctx.accounts.to_token_account.key();

        let seeds = [
            b"MerkleDistributor".as_ref(),
            &[ctx.accounts.distributor.bump],
        ];

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.from_token_vault.to_account_info(),
                    to: ctx.accounts.to_token_account.to_account_info(),
                    authority: ctx.accounts.distributor.to_account_info(),
                },
            )
            .with_signer(&[&seeds[..]]),
            amount,
        )?;

        let distributor = &mut ctx.accounts.distributor;
        distributor.total_amount_claimed = distributor.total_amount_claimed
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticError)?;
        require!(
            distributor.total_amount_claimed <= distributor.max_total_claim,
            ErrorCode::ExceededMaxClaim
        );
        distributor.num_nodes_claimed = distributor.num_nodes_claimed
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticError)?;

        require!(
            distributor.num_nodes_claimed <= distributor.max_num_nodes,
            ErrorCode::ExceededMaxNumNodes
        );

        msg!("index is {:?}", index);
        msg!("evm_claimer is {:?}", evm_claimer.as_ref());
        msg!("claim_to_ata is {:?}", ctx.accounts.to_token_account.key());
        msg!("claim_amount is {:?}", amount);
        
        Ok(())
    }

    #[allow(clippy::result_large_err)]
    pub fn claim_test_evm_sign(
        ctx: Context<Claim>,
        evm_claimer:[u8;20],
        account_index: u64,
        roots_index:u64,

        index: u64,
        amount: u64,
        proof: Vec<[u8; 32]>,

        msg: Vec<u8>, sig: [u8; 64], recovery_id: u8
    ) -> Result<()> {
        let account = &ctx.accounts.distributor;
        require!(!account.is_paused, ErrorCode::ProtocolPaused);
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= account.claim_start_at , ErrorCode::TooEarlyToClaim);

        let claim_status = &mut ctx.accounts.claim_status;// user => claim_status PDA
        require!(claim_status.claimed_amount == 0, ErrorCode::AlreadyClaimed);

        let distributor = &ctx.accounts.distributor;// init status and vault'owner

        require!(
            ctx.accounts.payer.key() != distributor.admin_auth,
            ErrorCode::Unauthorized
        );

        // Verify the EVM Sign.
        // Get what should be the Secp256k1Program instruction
        let ix: Instruction = load_instruction_at_checked(0, &ctx.accounts.ix_sysvar)?;


        let to_ata = ctx.accounts.to_token_account.key();
        let to_ata_bytes = to_ata.to_bytes();
        
        // create msg "Authorize BWB claim:${receivAddress}\n\n"
        let prefix_msg = b"Authorize BWB claim:";
        let middle_msg = b"\n\n";
        // equal Solidity Keccak256 hash
        let keccak256_hash = anchor_lang::solana_program::keccak::hashv(&[&to_ata_bytes,&amount.to_le_bytes()]);
        msg!("keccak256_hash  is {:?}", keccak256_hash.to_bytes());
        // Construct actual_message
        let mut actual_message: Vec<u8> = Vec::new();
        actual_message.extend_from_slice(b"\x19Ethereum Signed Message:\n98");
        msg!("actual_message.len() is {:?}", actual_message.len());
        actual_message.extend_from_slice(prefix_msg);
        actual_message.extend_from_slice(&ctx.accounts.to_token_account.owner.key().to_string().into_bytes());
        actual_message.extend_from_slice(middle_msg);
        actual_message.extend_from_slice(&keccak256_hash.as_ref());
        msg!("actual_message.len() is {:?}", actual_message.len());

        msg!("input msg is {:?}", &msg);
        msg!("actual_message  is {:?}", actual_message);

        // check token to_ata is evm_calimer points
        require!(actual_message == msg, ErrorCode::InvaildReceipentATA);

        // Check that ix is what we expect to have been sent
        utils::verify_secp256k1_ix(&ix, &evm_claimer, &msg, &sig, recovery_id)?;

        // Verify the merkle proof.
        let node = anchor_lang::solana_program::keccak::hashv(&[
            &index.to_le_bytes(),
            &evm_claimer,
            &amount.to_le_bytes(),
        ]);
        msg!("node hash is {:?}", node);

        let roots_account = &ctx.accounts.merkle_roots;

        require!(
            merkle_proof::verify(proof, roots_account.roots[roots_index as usize].root, node.0),
            ErrorCode::InvalidProof
        );

        // // Mark it claimed and send the tokens.
        // claim_status.claimed_amount = amount;
    
        // claim_status.claimed_at = clock.unix_timestamp;
        // claim_status.claimant = ctx.accounts.to_token_account.key();

        // let seeds = [
        //     b"MerkleDistributor".as_ref(),
        //     &[ctx.accounts.distributor.bump],
        // ];

        // token::transfer(
        //     CpiContext::new(
        //         ctx.accounts.token_program.to_account_info(),
        //         token::Transfer {
        //             from: ctx.accounts.from_token_vault.to_account_info(),
        //             to: ctx.accounts.to_token_account.to_account_info(),
        //             authority: ctx.accounts.distributor.to_account_info(),
        //         },
        //     )
        //     .with_signer(&[&seeds[..]]),
        //     amount,
        // )?;

        // let distributor = &mut ctx.accounts.distributor;
        // distributor.total_amount_claimed = distributor
        //     .total_amount_claimed
        //     .checked_add(amount)
        //     .ok_or(ErrorCode::ArithmeticError)?;
        // require!(
        //     distributor.total_amount_claimed <= distributor.max_total_claim,
        //     ErrorCode::ExceededMaxClaim
        // );
        // distributor.num_nodes_claimed = distributor
        //     .num_nodes_claimed.
        //     checked_add(1)
        //     .ok_or(ErrorCode::ArithmeticError)?;

        // require!(
        //     distributor.num_nodes_claimed <= distributor.max_num_nodes,
        //     ErrorCode::ExceededMaxNumNodes
        // );

        // msg!("index is {:?}", index);
        // msg!("evm_claimer is {:?}", evm_claimer.as_ref());
        // msg!("claim_to_ata is {:?}", ctx.accounts.to_token_account.key());
        // msg!("claim_amount is {:?}", amount);
        
        Ok(())
    }

    pub fn update_receiver(ctx: Context<UpdateAdminRole>, new_receiver: Pubkey) -> Result<()> {
        let distributor = &mut ctx.accounts.distributor;
        distributor.receiver = new_receiver;

        Ok(())
    }

    pub fn update_cosigner(ctx: Context<UpdateAdminRole>, new_cosigner: Pubkey) -> Result<()> {
        let distributor = &mut ctx.accounts.distributor;
        distributor.cosigner = new_cosigner;

        Ok(())
    }

    pub fn update_operator(ctx: Context<UpdateAdminRole>, new_operator: Pubkey) -> Result<()> {
        let distributor = &mut ctx.accounts.distributor;
        distributor.operator = new_operator;

        Ok(())
    }

    pub fn set_is_paused(ctx: Context<SetIsPaused>, is_paused: bool) -> Result<()> {
        let account = &mut ctx.accounts.distributor;

        account.is_paused = is_paused;
        Ok(())
    }

    pub fn withdraw_bwb_token(ctx: Context<WithdrawBWBToken>, amount: u64) -> Result<()> {

        // Transfer tokens from taker to initializer
        let bump = ctx.accounts.distributor.bump;
        let seeds = &[b"MerkleDistributor".as_ref(), &[bump]];

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.from_token_account.to_account_info(),
                    to: ctx.accounts.to_token_account.to_account_info(),
                    authority: ctx.accounts.distributor.to_account_info(),
                },
            )
            .with_signer(&[&seeds[..]]),
            amount,
        )?;

        Ok(())
    }

    pub fn withdraw_other_token(ctx: Context<WithdrawOtherToken>, amount: u64) -> Result<()> {

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.from_token_account.to_account_info(),
                    to: ctx.accounts.to_token_account.to_account_info(),
                    authority: ctx.accounts.from_ata_owner.to_account_info(),
                }
            ),
            amount
        )?;

        Ok(())
    }


    
}


/// Accounts for [merkle_distributor::new_distributor].
#[derive(Accounts)]
pub struct NewDistributor<'info> {
    /// Admin key of the distributor and payer.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// [MerkleDistributor] 
    #[account(
        init,
        space = 8 + MerkleDistributor::LEN,
        seeds = [b"MerkleDistributor".as_ref()],
        bump,
        payer = payer
    )]
    pub distributor: Account<'info, MerkleDistributor>,

    /// Token vault
    #[account(
        init,
        seeds=[b"token_vault"],
        token::mint = mint,
        token::authority=distributor,
        payer = payer,
        bump
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// The mint to distribute.
    pub mint: Account<'info, Mint>,// BWB token address

    /// The [System] program.
    pub system_program: Program<'info, System>,
    /// The [Associated Token] program.
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(account_index:u64)]
pub struct InitMerkleRoots<'info> {// create MerkleRoots pda
    /// Admin key of the distributor and payer.
    #[account(mut, address = distributor.operator)]
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"MerkleDistributor".as_ref()],
        bump,
    )]
    pub distributor: Account<'info, MerkleDistributor>,

    #[account(
        init,
        space = 8 + MerkleRoots20::LEN,
        seeds = [b"merkle_roots".as_ref(), account_index.to_le_bytes().as_ref()],
        bump,
        payer = operator
    )]
    pub merkle_roots: Account<'info, MerkleRoots20>,
    /// The [System] program.
    pub system_program: Program<'info, System>,
}

/// [merkle_distributor::claim] accounts.
#[derive(Accounts)]
#[instruction(evm_claimer: [u8; 20], account_index:u64)]
pub struct Claim<'info> {
    /// The [MerkleDistributor].
    #[account(
        mut,
        seeds = [b"MerkleDistributor".as_ref()],
        bump,
    )]
    pub distributor: Account<'info, MerkleDistributor>,

    /// Status of the claim.
    #[account(
        init_if_needed,
        space = 8 + ClaimStatus::LEN,
        seeds = [
            b"ClaimStatus".as_ref(),
            distributor.key().as_ref(),
            evm_claimer.as_ref()
        ],
        bump,
        payer = payer
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    /// The mint to distribute.
    pub mint: Account<'info, Mint>,

    /// Distributor ATA containing the tokens to distribute.
    /// Token vault
    #[account(
        mut,
        seeds=[b"token_vault"],
        bump,
        token::mint = mint,// BWB token 地址
        token::authority=distributor
    )]
    pub from_token_vault: Account<'info, TokenAccount>,// BWB token account, owner is distributor

    /// Account to send the claimed tokens to.
    #[account(mut)]
    pub to_token_account: Account<'info, TokenAccount>,// receipent token account PDA

    #[account(
        address = distributor.roots_accounts[account_index as usize],
        seeds = [b"merkle_roots".as_ref(), account_index.to_le_bytes().as_ref()],
        bump,
    )]
    pub merkle_roots: Box<Account<'info, MerkleRoots20>>,

    /// Payer of the claim.
    #[account(mut)]
    pub payer: Signer<'info>,// sender

    #[account(address = distributor.cosigner)]// base == cosigner
    cosigner: Signer<'info>,

    /// The [System] program.
    pub system_program: Program<'info, System>,

    /// SPL [Token] program.
    pub token_program: Program<'info, Token>,

    /// CHECK: The address check is needed because otherwise
    /// the supplied Sysvar could be anything else.
    /// The Instruction Sysvar has not been implemented
    /// in the Anchor framework yet, so this is the safe approach.
    #[account(address = IX_ID)]
    pub ix_sysvar: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateAdminRole<'info> {
    #[account(address=distributor.admin_auth)]
    pub admin_auth: Signer<'info>,

    #[account(
        mut,
        seeds = [b"MerkleDistributor".as_ref()],
        bump, 
        has_one = admin_auth @ ErrorCode::DistributorAdminMismatch,
    )]
    pub distributor: Account<'info, MerkleDistributor>,
}

/// State for the account which distributes tokens.
#[account]
pub struct MerkleDistributor {
    /// manage cosigner, operator, receiver
    pub admin_auth: Pubkey,
    /// token receiver(owner of to token account)
    pub receiver: Pubkey,
    /// claim cosigner
    pub cosigner: Pubkey, // base
    /// operator key used to set paused and withdraw token.
    pub operator: Pubkey,//admin_auth
    /// [Mint] of the token to be distributed.
    pub mint: Pubkey,
    /// Bump seed.
    pub bump: u8,
    /// 4 roots_account Pda
    pub roots_accounts: [Pubkey; 4],
    /// Maximum number of tokens that can ever be claimed from this [MerkleDistributor].
    pub max_total_claim: u64,
    /// Maximum number of nodes that can ever be claimed from this [MerkleDistributor].
    pub max_num_nodes: u64,
    /// Total amount of tokens that have been claimed.
    pub total_amount_claimed: u64,
    /// Number of nodes that have been claimed.
    pub num_nodes_claimed: u64,
    /// When the tokens start to claim.
    pub claim_start_at: i64,
    /// pause flag
    pub is_paused: bool,
    
}

impl MerkleDistributor {
    pub const LEN: usize = 32 * 5 + 1 + 32*4 + 8*5 + 1;
}

#[account]
pub struct MerkleRoots20 {
    /// root array,len is 20
    pub roots: [MerkleRoot; 20],
}

impl MerkleRoots20 {
    pub const LEN: usize = 32*20;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MerkleRoot {
    
    /// The 256-bit merkle root.
    pub root: [u8; 32],
}

impl MerkleRoot {
    pub const LEN: usize = 32;
}

/// Holds whether or not a claimant has claimed tokens.
#[account]
#[derive(Default)]
pub struct ClaimStatus {// evm =>ClaimStatus PDA
    /// Authority that claimed the tokens.
    pub claimant: Pubkey,
    /// When the tokens were claimed.
    pub claimed_at: i64,
    /// Amount of tokens claimed.
    pub claimed_amount: u64
}

impl ClaimStatus {
    pub const LEN: usize = 32 + 8 + 8 ;
}

#[derive(Accounts)]
pub struct SetIsPaused<'info> {
    #[account(address=distributor.operator)]
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"MerkleDistributor".as_ref()],
        bump, 
        has_one = operator @ ErrorCode::DistributorAdminMismatch,
    )]
    pub distributor: Account<'info, MerkleDistributor>,
}

#[derive(Accounts)]
pub struct WithdrawBWBToken<'info> {
    #[account(
        seeds = [b"MerkleDistributor".as_ref()],
        bump,
    )]
    pub distributor: Account<'info, MerkleDistributor>,

    #[account(address = distributor.operator)]
    pub operator: Signer<'info>,
    #[account(mut,token::mint=distributor.mint)]
    pub from_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint=distributor.mint,
        token::authority=distributor.receiver
    )]
    pub to_token_account: Account<'info, TokenAccount>,
    /// SPL [Token] program.
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawOtherToken<'info> {
    
    #[account(
        seeds = [b"MerkleDistributor".as_ref()],
        bump,
    )]
    pub distributor: Account<'info, MerkleDistributor>,

    #[account(address = distributor.operator)]
    pub operator: Signer<'info>,
    /// The mint to distribute.
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint=mint)]
    pub from_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint=mint,
        token::authority=distributor.receiver
    )]
    pub to_token_account: Account<'info, TokenAccount>,
    #[account(address = from_token_account.owner)]
    pub from_ata_owner: Signer<'info>,// this program Id
    /// SPL [Token] program.
    pub token_program: Program<'info, Token>,
}

/// Accounts for [merkle_distributor::update_distributor].
#[derive(Accounts)]
pub struct UpdateDistributor<'info> {
    /// Admin key of the distributor.
    pub admin_auth: Signer<'info>,

    #[account(mut, has_one = admin_auth @ ErrorCode::DistributorAdminMismatch)]
    pub distributor: Account<'info, MerkleDistributor>,
}