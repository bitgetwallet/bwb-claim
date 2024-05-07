#![allow(clippy::too_many_arguments)]
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

use crate::error::ErrorCode;

pub mod error;

//declare_id!("HfWDaBxjLdxQxmzG8gBWZWC66upnjXhrzwuCSKoYvmmX");
declare_id!("Gmvi8YDqRzuJD7zvQdpBC8b2zmu9J4bui5joyqzzKV9A");

/// The [merkle_distributor] program.
#[program]
pub mod cosigner_distributor {

    use super::*;

    pub fn new_distributor(
        ctx: Context<NewDistributor>,
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

        distributor.total_amount_claimed = 0;

        distributor.claim_start_at = start_timestamp;

        Ok(())
    }

    /// Claims tokens from the [MerkleDistributor].
    #[allow(clippy::result_large_err)]
    pub fn claim(ctx: Context<Claim>, evm_claimer: [u8; 20], amount: u64) -> Result<()> {
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

        // Mark it claimed and send the tokens.
        claim_status.claimed_amount = amount;
        let clock = Clock::get()?;
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
        distributor.total_amount_claimed = distributor
            .total_amount_claimed
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticError)?;

        msg!("evm_claimer is {:?}", evm_claimer.as_ref());
        msg!("claim_to_ata is {:?}", ctx.accounts.to_token_account.key());
        msg!("claim_amount is {:?}", amount);
        
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

    /// [MerkleDistributor].
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

/// [merkle_distributor::claim] accounts.
#[derive(Accounts)]
#[instruction(evm_claimer: [u8; 20])]
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
        token::mint = mint,
        token::authority=distributor
    )]
    pub from_token_vault: Account<'info, TokenAccount>,// BWB token account, owner is distributor

    /// Account to send the claimed tokens to.
    #[account(mut)]
    pub to_token_account: Account<'info, TokenAccount>,

    /// Payer of the claim.
    #[account(mut)]
    pub payer: Signer<'info>,// == payer==sender

    #[account(address = distributor.cosigner)]
    cosigner: Signer<'info>,

    /// The [System] program.
    pub system_program: Program<'info, System>,

    /// SPL [Token] program.
    pub token_program: Program<'info, Token>,
}

/// State for the account which distributes tokens.
#[account]
#[derive(Default)]
pub struct MerkleDistributor {
    /// manage cosigner, operator, receiver
    pub admin_auth: Pubkey,
    /// token receiver(owner of to token account)
    pub receiver: Pubkey,
    /// claim cosigner
    pub cosigner: Pubkey, // base
    /// operator key used to set paused and withdraw token.
    pub operator: Pubkey,//admin_auth
    /// Bump seed.
    pub bump: u8,

    /// [Mint] of the token to be distributed.
    pub mint: Pubkey,
    
    /// Total amount of tokens that have been claimed.
    pub total_amount_claimed: u64,

    /// When the tokens start to claim.
    pub claim_start_at: i64,
    /// pause flag
    pub is_paused: bool,
}

impl MerkleDistributor {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 1 + 32 + 8 + 8 + 1;
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
    pub const LEN: usize = 32 + 8 + 8 + 1;
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
    pub mint: Account<'info, Mint>,// BWB token address
    #[account(mut, token::mint=mint)]
    pub from_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint=mint,
        token::authority=distributor.receiver
    )]
    pub to_token_account: Account<'info, TokenAccount>,
    #[account(address = from_token_account.owner)]
    pub from_ata_owner: Signer<'info>,// this Program Id
    /// SPL [Token] program.
    pub token_program: Program<'info, Token>,
}
