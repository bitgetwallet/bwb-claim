import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CosignerDistributor } from "../target/types/cosigner_distributor";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram
  
} from '@solana/web3.js';

import {
  getPayer,
  initializeSigner,
  hexToBytes
} from '../utils/utils';

import {TOKEN_PROGRAM_ID} from "@solana/spl-token";

import { expect } from "chai";

describe("cosigner-distributor", async () => {
    let payer: Keypair = await getPayer();
    let cosigner: Keypair = await initializeSigner('../keys/wallet-pair-cosigner.json');
    let admin_auth = await initializeSigner('../keys/fund_account.json');
    let newPayer: Keypair = await initializeSigner('../keys/new-account.json');
    let programIdSelf: Keypair = await initializeSigner('../keys/cosigner_distributor-keypair.json');
    console.log("payer is : " + payer.publicKey);
    console.log("cosigner is : " + cosigner.publicKey);
    console.log("admin_auth is : " + admin_auth.publicKey);
    console.log("newPayer is : " + newPayer.publicKey.toBase58());
    console.log("programIdSelf is : " + programIdSelf.publicKey.toBase58());

    let token_mint = new PublicKey("83QLg6QKjfFCgoFWTx8x2EAytbAwVgA5G1mtAcsnybtp");
    let payer_ata = new PublicKey("AR1aJmL5jWmV53bQXSQaHNvB6uqmbC9yH1yVqhRnHvvi");
    let newPayer_ata = new PublicKey('Bx66barTesm9yjcvRd8QSedgpxphBY8EfgbvgXUthDGe');
    // payer_ata = newPayer_ata;

    process.env.ANCHOR_WALLET = process.env.HOME + '/.config/solana/id.json';
    //process.env.ANCHOR_PROVIDER_URL = 'https://convincing-damp-leaf.solana-mainnet.quiknode.pro/edde6ea1d584780dce63a8d70cb673b94dd025a8/';
    // process.env.ANCHOR_PROVIDER_URL = 'https://api.mainnet-beta.solana.com';
    process.env.ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    const program = anchor.workspace.CosignerDistributor as Program<CosignerDistributor>;

    let [distributorPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("MerkleDistributor")],
      program.programId
    );

    let evmClaimer01 = "0x1D2440612571006CFAE090A9C8198a4a4e9b0a61"//地址大小写区分
    let evmClaimer02 = "0xAc0E6Bf367Fd747b975914601A0A2F482d10Db80"
    let evmClaimer03 = "0x2c4DFAb84C64Ca6a4676D022f39f87c21096e93D"

    let evmClaimer = evmClaimer02;
    let [claimStatusPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ClaimStatus"), distributorPda.toBuffer() ,Buffer.from(evmClaimer.slice(2), 'hex')],
      program.programId
    );


    let [tokenVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault")],
      program.programId
    );

    console.log("distributorPda: " + distributorPda);
    console.log("claimStatusPda: " + claimStatusPda);
    console.log("tokenVaultPda: " + tokenVaultPda);

    it("test newDistributor", async() => {
      let now_time = Date.now();
      let time_stamp = (now_time/1000).toFixed();
      let tx = await program.methods.newDistributor(
        new anchor.BN(time_stamp)
      ).accounts({
        cosigner:cosigner.publicKey,
        adminAuth: admin_auth.publicKey,
        distributor: distributorPda,
        tokenVault:tokenVaultPda,
        mint: token_mint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID
      }).signers([cosigner, admin_auth])
      .rpc();

      console.log("Your transaction signature", tx);

      let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorData.cosigner.toBase58()).equal(cosigner.publicKey.toBase58());
      expect(distributorData.adminAuth.toBase58()).equal(admin_auth.publicKey.toBase58());
      expect(distributorData.mint.toBase58()).equal(token_mint.toBase58());

  })

  it("test updateDistributor", async() => {
    let now_time = Date.now();
    let time_stamp = (now_time/1000).toFixed();
    let tx = await program.methods.updateDistributor(
      cosigner.publicKey
    ).accounts({
      adminAuth: admin_auth.publicKey,
      distributor: distributorPda,
    }).signers([admin_auth])
    .rpc();

    console.log("Your transaction signature", tx);

    let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
    expect(distributorData.cosigner.toBase58()).equal(cosigner.publicKey.toBase58());
      expect(distributorData.adminAuth.toBase58()).equal(admin_auth.publicKey.toBase58());
      expect(distributorData.mint.toBase58()).equal(token_mint.toBase58());


  })

  it("test claim", async() => {
    let transferAmount = new anchor.BN(3e9);
    let evmClaimerBytes = await hexToBytes(evmClaimer);
    let tx = await program.methods.claim(
    //let tx = await program.methods.claimTestNode(
      evmClaimerBytes,
      transferAmount,
    ).accounts({
      distributor: distributorPda,
      claimStatus: claimStatusPda,
      mint: token_mint,
      fromTokenVault: tokenVaultPda,
      toTokenAccount:payer_ata,// one token acount// token 接收者 + amount +
      payer:payer.publicKey,// sender
      cosigner:cosigner.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([payer,cosigner])
    .rpc({
      skipPreflight:true
    }).catch(e => console.error(e));

    console.log("Your transaction signature", tx);

    console.log("Your transaction signature", tx);

    let claimStatusPdaData = await program.account.claimStatus.fetch(claimStatusPda);
    console.log("claimStatusPdaData", claimStatusPdaData.claimedAt.toString());
    expect(claimStatusPdaData.claimant.toBase58()).equal(payer.publicKey.toBase58());
    expect(claimStatusPdaData.claimedAt.toNumber()).gte(0);
    expect(claimStatusPdaData.claimedAmount.toString()).equal(transferAmount.toString());

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
      cosigner: cosigner.publicKey,
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
        cosigner: cosigner.publicKey,
        distributor: distributorPda,
        mint:token_mint,
        fromTokenAccount:oneTokenAccount,
        toTokenAccount:payer_ata,
        fromAtaOwner:programIdSelf.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      }).signers([cosigner,programIdSelf])
      .rpc().catch(e => console.error(e));
    
    console.log("Your transaction signature", tx);

  })



});
