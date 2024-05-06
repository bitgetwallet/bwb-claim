import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MerkleDistributor } from "../target/types/merkle_distributor";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
  
} from '@solana/web3.js';

import {
  getPayer,
  initializeSigner,
  hexToBytes
} from '../utils/utils';

// import { parseBalanceMap } from "../utils/evm-src/parse-balance-map";
import { parseBalanceMap } from "../utils/parse-balance-map";
import {airdropData as airdropDataRaw} from "../data/airdrop-amounts";
import { u64,TOKEN_PROGRAM_ID,} from "@solana/spl-token";

import { ethers} from "ethers"
import 'dotenv/config'
import { expect } from "chai";


/// Sample Create Signature function that signs with ethers signMessage
async function createSignature(eth_signer: ethers.Wallet, solanaPublicKey: Uint8Array): Promise<string> {
  // keccak256 hash of the message
  const messageHash: string = ethers.utils.solidityKeccak256(['bytes'],[solanaPublicKey]);
  // get hash as Uint8Array of size 32
  const messageHashBytes: Uint8Array = ethers.utils.arrayify(messageHash);
  // Signed message that is actually this:
  // sign(keccak256("\x19Ethereum Signed Message:\n" + len(messageHash) + messageHash)))
  const signature = await eth_signer.signMessage(messageHashBytes);

  return signature;
}

const { API_URL, PRIVATE_KEY01,PRIVATE_KEY02,PRIVATE_KEY03,PRIVATE_KEY04 } = process.env;
let PRIVATE_KEY = PRIVATE_KEY04;
const provider = new ethers.providers.AlchemyProvider("mainnet", API_URL);

// anchor config
process.env.ANCHOR_WALLET = process.env.HOME + '/.config/solana/id.json';
process.env.ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';

describe('Merkle Distributor', async () => {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  let payer: Keypair = await getPayer();
  let base: Keypair = await initializeSigner('../keys/wallet-pair-cosigner.json');
  let admin_auth = await initializeSigner('../keys/fund_account.json');
  let newPayer: Keypair = await initializeSigner('../keys/new-account.json');
  let programIdSelf: Keypair = await initializeSigner('../keys/merkle_owner_pId.json');
  console.log("payer is : " + payer.publicKey);
  console.log("base is : " + base.publicKey);
  console.log("admin_auth is : " + admin_auth.publicKey);
  console.log("newPayer is : " + newPayer.publicKey.toBase58());
  console.log("programIdSelf is : " + programIdSelf.publicKey.toBase58());

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.MerkleDistributor as Program<MerkleDistributor>;

  // ETH sign publickey_bytes
  // Solana and Ethereum wallets
  const eth_signer: ethers.Wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  let payer01: Keypair = newPayer;
  let publickey = payer01.publicKey.toBytes();
  console.log("publickey Array is", Array.from(publickey));

  // Stuff
  let eth_address: string; // Ethereum address to be recovered and checked against
  let full_sig: string; // 64 bytes + recovery byte
  let signature: Uint8Array; // 64 bytes of sig
  let recoveryId: number; // recovery byte (u8)
  let actual_message: Buffer; // actual signed message with Ethereum Message prefix

  
  before("====before", async () => {
      // Signature  // Full sig consists of 64 bytes + recovery byte
      full_sig = await createSignature(eth_signer, publickey );

      let full_sig_bytes = ethers.utils.arrayify(full_sig);
      signature = full_sig_bytes.slice(0, 64);
      recoveryId = full_sig_bytes[64] - 27;

      let msg_digest = ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(['bytes'],[publickey])
      );
      actual_message = Buffer.concat([
          Buffer.from('\x19Ethereum Signed Message:\n32'),
          msg_digest,
      ]);
      console.log("actual_message is", Array.from(actual_message));

      // Calculated Ethereum Address (20 bytes) from public key (32 bytes)
      eth_address = ethers.utils
          .computeAddress(eth_signer.publicKey)
          .slice(2);
  })

  // create merkle tree data
  const { claims, merkleRoot, tokenTotal } = parseBalanceMap(airdropDataRaw);
  // let root: number[] = Array.from(Buffer.from(merkleRoot, 'utf8'));
  let root: number[] = Array.from(merkleRoot);
  let maxTotalClaim = new u64(tokenTotal);
  let maxNumNodes = new u64(Object.keys(claims).length);

  let [distributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("MerkleDistributor"), base.publicKey.toBuffer()],
    program.programId
  );

  let token_mint = new PublicKey("83QLg6QKjfFCgoFWTx8x2EAytbAwVgA5G1mtAcsnybtp");
  let payer_ata = new PublicKey("AR1aJmL5jWmV53bQXSQaHNvB6uqmbC9yH1yVqhRnHvvi");
  let newPayer_ata = new PublicKey('Bx66barTesm9yjcvRd8QSedgpxphBY8EfgbvgXUthDGe');

  let [tokenVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault"), token_mint.toBuffer()],
    program.programId
  );

  let evmClaimer = eth_signer.address;
  let [claimStatusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ClaimStatus"), distributorPda.toBuffer() ,Buffer.from(evmClaimer.slice(2), 'hex')],
    program.programId
  );

  console.log("distributorPda: " + distributorPda);
  console.log("claimStatusPda: " + claimStatusPda);
  console.log("tokenVaultPda: " + tokenVaultPda);
  console.log("================== ");

  it("test newDistributor", async() => {
      let now_time = Date.now();
      let time_stamp = (now_time/1000).toFixed();
      let tx = await program.methods.newDistributor(
        root,
        maxTotalClaim,
        maxNumNodes,
        new anchor.BN(time_stamp)
      ).accounts({
        base:base.publicKey,
        adminAuth: admin_auth.publicKey,
        distributor: distributorPda,
        tokenVault:tokenVaultPda,
        mint: token_mint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID
      }).signers([base, admin_auth])
      .rpc();

      console.log("Your transaction signature", tx);

      let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorData.base.toBase58()).equal(base.publicKey.toBase58());
      expect(distributorData.adminAuth.toBase58()).equal(admin_auth.publicKey.toBase58());
      expect(distributorData.mint.toBase58()).equal(token_mint.toBase58());
      expect(distributorData.maxNumNodes.toString()).equal(maxNumNodes.toString());
      expect(distributorData.maxTotalClaim.toString()).equal(maxTotalClaim.toString());

  })

  it("test updateDistributor", async() => {
    let now_time = Date.now();
      let time_stamp = (now_time/1000).toFixed();
    // first update merkle-distributor/data/airdrop-amounts.ts
    let tx = await program.methods.newDistributor(
      root,
      maxTotalClaim,
      maxNumNodes,
      new anchor.BN(time_stamp)
    ).accounts({
      base:base.publicKey,
      adminAuth: admin_auth.publicKey,
      distributor: distributorPda,
      tokenVault:tokenVaultPda,
      mint: token_mint,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID
    }).signers([base, admin_auth])
    .rpc();

    console.log("Your transaction signature", tx);

    let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
    expect(distributorData.base.toBase58()).equal(base.publicKey.toBase58());
    expect(distributorData.adminAuth.toBase58()).equal(admin_auth.publicKey.toBase58());
    expect(distributorData.mint.toBase58()).equal(token_mint.toBase58());
    expect(distributorData.maxNumNodes.toString()).equal(maxNumNodes.toString());
    expect(distributorData.maxTotalClaim.toString()).equal(maxTotalClaim.toString());

  })

  it("test claim", async() => {
    let evmClaimer01Claim = claims[evmClaimer];
    let proof = evmClaimer01Claim.proof.map(buffer => Array.from(buffer));
    let index = new u64(evmClaimer01Claim.index);
    let amount = new u64(evmClaimer01Claim.amount);

    console.log("ethers.utils.arrayify('0x' + eth_address)", '0x' + eth_address);
    let claimStatusPdaData = await program.account.claimStatus.fetch(claimStatusPda);
    let beforeAt = claimStatusPdaData.claimedAt;
    let tx = await program.methods.claim(
      Array.from(ethers.utils.arrayify('0x' + eth_address)),
      index,
      amount,
      proof,

      Buffer.from(actual_message),
      Array.from(signature),
      recoveryId
    ).accounts({
      distributor: distributorPda,
      claimStatus: claimStatusPda,
      mint: token_mint,
      fromTokenVault: tokenVaultPda,
      toTokenAccount:payer_ata,
      payer:payer.publicKey,
      cosigner:base.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      ixSysvar:anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY
    })
    .preInstructions(
      // Secp256k1 instruction
      [
        anchor.web3.Secp256k1Program.createInstructionWithEthAddress({
            ethAddress: eth_address,
            message: actual_message,
            signature: signature,
            recoveryId: recoveryId,
        })
      ]
    )
    .signers([payer,base])
    .rpc();

    console.log("Your transaction signature", tx);

    claimStatusPdaData = await program.account.claimStatus.fetch(claimStatusPda);
    console.log("claimStatusPdaData", claimStatusPdaData.claimedAt.toString());
    expect(claimStatusPdaData.claimant.toBase58()).equal(payer.publicKey.toBase58());
    expect(claimStatusPdaData.claimedAt.toNumber()).gte(beforeAt.toNumber());
    expect(claimStatusPdaData.claimedAmount.toString()).equal(amount.toString());

  })

  it("test updateAdminAuth", async() => {
    // first update merkle-distributor/data/airdrop-amounts.ts
    let new_admin_auth = newPayer;
    let tx = await program.methods.updateAdminAuth().accounts({
      newAdminAuth: new_admin_auth.publicKey,
      adminAuth: admin_auth.publicKey,
      distributor: distributorPda,
    }).signers([admin_auth])
    .rpc();
    console.log("Your transaction signature", tx);

    let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
    expect(distributorData.adminAuth.toBase58()).equal(new_admin_auth.publicKey.toBase58());

  })

  it("test withdrawBwbToken", async() => {
    let transferAmount = new anchor.BN(3e9);
    let tx = await program.methods.withdrawBwbToken(transferAmount).accounts({
      cosigner: base.publicKey,
      distributor: distributorPda,
      fromTokenAccount:tokenVaultPda,
      toTokenAccount:payer_ata,
      tokenProgram: TOKEN_PROGRAM_ID
    }).signers([admin_auth])
    .rpc();

    console.log("Your transaction signature", tx);

  })

  it("test withdrawBwbToken", async() => {
    let transferAmount = new anchor.BN(3e9);
    let oneTokenAccount = new PublicKey("FM3wTuHugJaZqyWthnyVAJrQVfG7LaTBciSYkPjaNGEL");
    let tx = await program.methods.withdrawOtherToken(transferAmount).accounts({
        cosigner: base.publicKey,
        distributor: distributorPda,
        mint:token_mint,
        fromTokenAccount:oneTokenAccount,
        toTokenAccount:payer_ata,
        fromAtaOwner:programIdSelf.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      }).signers([base,programIdSelf])
      .rpc().catch(e => console.error(e));
    
    console.log("Your transaction signature", tx);

  })


})