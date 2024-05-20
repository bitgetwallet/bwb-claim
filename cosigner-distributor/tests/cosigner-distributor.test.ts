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

describe("cosigner-distributor", () => {
    let payer: Keypair;
    let cosigner: Keypair ;
    let adminAuth: Keypair;
    let newPayer: Keypair;
    let receiver: Keypair;
    let operator: Keypair;
    let programIdSelf: Keypair;
    let deployer: Keypair;

    let user01: Keypair ;//J9DKMBBqdnFDuPxBNqxeMTsL3vWQatz3tJJEBhg71S24
    let user02: Keypair ;//BKprKM553wXVWayY3X38KDRYfkC4cCqh5vpKwa7Qygr2
    let user01_ata = new PublicKey("EXwCW3QYc14XnJvCR4umvWxPBGyrRbU7MuNmkXvDd1i9");
    let user02_ata = new PublicKey("E1T9XWnS1nFwSL41nXYs5qoLQC6WrTJxkvQwo32TNzJD");
    let user : Keypair = user01;
    let user_ata = user01_ata;

    let payer_ata = new PublicKey("AR1aJmL5jWmV53bQXSQaHNvB6uqmbC9yH1yVqhRnHvvi");
    let newPayer_ata = new PublicKey('Bx66barTesm9yjcvRd8QSedgpxphBY8EfgbvgXUthDGe');
    let receiver_ata = new PublicKey('ERo43ghcrhgz6nUGayP5N97XQCYVR8B8y3RNVwVsgE4F');
    // payer_ata = newPayer_ata;

    process.env.ANCHOR_WALLET = process.env.HOME + '/.config/solana/id.json';

    let token_mint = new PublicKey("83QLg6QKjfFCgoFWTx8x2EAytbAwVgA5G1mtAcsnybtp");//devnet
    process.env.ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    // let token_mint = new PublicKey("G1GV35DHibxUDJtMC9DBRzruqhLhEe6tr85WQ73XoPJ3");//mainnet TT02
    // process.env.ANCHOR_PROVIDER_URL = 'https://special-compatible-meadow.solana-mainnet.quiknode.pro/09ca4f4810f96f06bc274c89314e46f0f433e93e';
    // const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
    
    anchor.setProvider(anchor.AnchorProvider.env());

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

    before("",async () => {
      payer = await getPayer();
      cosigner = await initializeSigner('../keys/wallet-pair-cosigner.json');
      adminAuth = await initializeSigner('../keys/fund_account.json');
      receiver = await initializeSigner('../keys/receiver-keypair.json');
      operator = await initializeSigner('../keys/operate-keypair.json');
      programIdSelf = await initializeSigner('../keys/cosigner_distributor-keypair-main.json');

      user01 = await initializeSigner('../keys/userKp.json');//J9DKMBBqdnFDuPxBNqxeMTsL3vWQatz3tJJEBhg71S24
      user02 = await initializeSigner('../keys/userKp02.json');//BKprKM553wXVWayY3X38KDRYfkC4cCqh5vpKwa7Qygr2
      user01_ata = new PublicKey("EXwCW3QYc14XnJvCR4umvWxPBGyrRbU7MuNmkXvDd1i9");
      user02_ata = new PublicKey("E1T9XWnS1nFwSL41nXYs5qoLQC6WrTJxkvQwo32TNzJD");
      user  = user01;
      user_ata = user01_ata;

      deployer = payer;

      console.log("payer is : " + payer.publicKey);
      console.log("cosigner is : " + cosigner.publicKey);
      console.log("adminAuth is : " + adminAuth.publicKey);
      console.log("receiver is : " + receiver.publicKey.toBase58());
      console.log("operator is : " + operator.publicKey.toBase58());
      console.log("programIdSelf is : " + programIdSelf.publicKey.toBase58());

    })

    it("test newDistributor", async() => {
      let programDataPDA = new PublicKey("AUtGkZC7A5Rm9jDvFgT7aPKVYfS6HyJKnMeWh5KBN1eK");// todo
      let now_time = Date.now();
      let time_stamp = (now_time/1000).toFixed();
      let tx = await program.methods.newDistributor(
        new anchor.BN(time_stamp),
        cosigner.publicKey, adminAuth.publicKey,receiver.publicKey, operator.publicKey
      ).accounts({
        authority: deployer.publicKey,
        distributor: distributorPda,
        tokenVault:tokenVaultPda,
        mint: token_mint,
        program:program.programId,
        programData:programDataPDA,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID
      }).signers([deployer])
      .rpc().catch((err) => {console.log(err)});

      console.log("Your transaction signature", tx);

      let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorData.cosigner.toBase58()).equal(cosigner.publicKey.toBase58());
      expect(distributorData.adminAuth.toBase58()).equal(adminAuth.publicKey.toBase58());
      expect(distributorData.mint.toBase58()).equal(token_mint.toBase58());
      expect(distributorData.claimStartAt).equal(new anchor.BN(time_stamp));
      expect(distributorData.receiver.toString()).equals(receiver.publicKey.toBase58());
      expect(distributorData.operator.toString()).equals(operator.publicKey.toBase58());


    })

  it("test claim", async() => {
    let transferAmount = new anchor.BN(3e9);
    let evmClaimerBytes = await hexToBytes(evmClaimer);
    let tx = await program.methods.claim(
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
      skipPreflight:false
    }).catch(e => console.error(e));

    console.log("Your transaction signature", tx);

    let claimStatusPdaData = await program.account.claimStatus.fetch(claimStatusPda);
    console.log("claimStatusPdaData", claimStatusPdaData.claimedAt.toString());
    expect(claimStatusPdaData.claimant.toBase58()).equal(payer_ata.toBase58());
    expect(claimStatusPdaData.claimedAt.gte(new anchor.BN(0))).equal(true);
    expect(claimStatusPdaData.claimedAmount.eq(transferAmount)).equal(true);

  })

  it("test withdrawBwbToken", async() => {
    let transferAmount = new anchor.BN(3e9);
    let tx = await program.methods.withdrawBwbToken(transferAmount).accounts({
      operator: operator.publicKey,
      distributor: distributorPda,
      fromTokenAccount:tokenVaultPda,
      toTokenAccount:receiver_ata,
      tokenProgram: TOKEN_PROGRAM_ID
    }).signers([operator])
    .rpc();

    console.log("Your transaction signature", tx);

  })

  it("test withdrawBwbToken", async() => {
    let transferAmount = new anchor.BN(3e9);
    let oneTokenAccount = new PublicKey("24zdjKrEqBwQPRzE8VprH7vAGdHezG78Xb9Luj4VNadX");
    let tx = await program.methods.withdrawOtherToken(transferAmount).accounts({
        operator: operator.publicKey,
        distributor: distributorPda,
        mint:token_mint,
        fromTokenAccount:oneTokenAccount,
        toTokenAccount:receiver_ata,
        fromAtaOwner:programIdSelf.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      }).signers([operator,programIdSelf])
      .rpc().catch(e => console.error(e));
    
    console.log("Your transaction signature", tx);

  })

  it("Set protocol paused", async () => {
    
    try {
      let distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      // console.log("distributorPdaData is ", distributorPdaData);
      expect(distributorPdaData.isPaused).equals(false);
      let tx = await program.methods.setIsPaused(
        true
      ).accounts({
        distributor:distributorPda,
        operator:operator.publicKey
      }).signers([operator])
      .rpc();
      console.log("Your transaction signature", tx);

      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.isPaused).equals(true);

      tx = await program.methods.setIsPaused(
        true
      ).accounts({
        distributor:distributorPda,
        operator:operator.publicKey
      }).signers([operator])
      .rpc();
      console.log("Your transaction signature", tx);

      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.isPaused).equals(false);
    } catch (error) {
      console.log(error);
    }

  });

  it("Update adminAuth roles", async () => {
    
    try {//updateAdmin
      let distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      console.log("distributorPdaData is ", distributorPdaData);
      expect(distributorPdaData.adminAuth.toString()).equals(adminAuth.publicKey.toBase58());
      let new_admin = user01.publicKey;
      let tx = await program.methods.updateAdmin(
        new_admin
      ).accounts({
        distributor:distributorPda,
        adminAuth:adminAuth.publicKey
      }).signers([adminAuth])
      .rpc();
      console.log("Your updateAdmin signature", tx);

      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.adminAuth.toString()).equals(new_admin.toBase58());

      new_admin = adminAuth.publicKey;
      tx = await program.methods.updateAdmin(
        new_admin
      ).accounts({
        distributor:distributorPda,
        adminAuth:user01.publicKey
      }).signers([user01])
      .rpc();
      console.log("Your updateAdmin signature", tx);
      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.adminAuth.toString()).equals(adminAuth.publicKey.toBase58());
    } catch (error) {
      console.log(error);
    }

    try {//updateCosigner
      let distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      console.log("distributorPdaData is ", distributorPdaData);
      expect(distributorPdaData.cosigner.toString()).equals(cosigner.publicKey.toBase58());
      let new_cosigner = user01.publicKey;
      let tx = await program.methods.updateCosigner(
        new_cosigner
      ).accounts({
        distributor:distributorPda,
        adminAuth:adminAuth.publicKey
      }).signers([adminAuth])
      .rpc();
      console.log("Your updateCosigner signature", tx);

      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.cosigner.toString()).equals(new_cosigner.toBase58());

      new_cosigner = cosigner.publicKey;
      tx = await program.methods.updateCosigner(
        new_cosigner
      ).accounts({
        distributor:distributorPda,
        adminAuth:adminAuth.publicKey
      }).signers([adminAuth])
      .rpc();
      console.log("Your updateCosigner signature", tx);
      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.cosigner.toString()).equals(cosigner.publicKey.toBase58());
    } catch (error) {
      console.log(error);
    }

    try {//updateOperator
      let distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      console.log("distributorPdaData is ", distributorPdaData);
      expect(distributorPdaData.operator.toString()).equals(operator.publicKey.toBase58());
      let new_operator = user01.publicKey;
      let tx = await program.methods.updateOperator(
        new_operator
      ).accounts({
        distributor:distributorPda,
        adminAuth:adminAuth.publicKey
      }).signers([adminAuth])
      .rpc();
      console.log("Your updateOperator signature", tx);

      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.operator.toString()).equals(new_operator.toBase58());

      new_operator = operator.publicKey;
      tx = await program.methods.updateOperator(
        new_operator
      ).accounts({
        distributor:distributorPda,
        adminAuth:adminAuth.publicKey
      }).signers([adminAuth])
      .rpc();
      console.log("Your updateOperator signature", tx);
      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.operator.toString()).equals(operator.publicKey.toBase58());
    } catch (error) {
      console.log(error);
    }

    try {//updateReceiver
      let distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      console.log("distributorPdaData is ", distributorPdaData);
      let new_receiver = user01.publicKey;
      let tx = await program.methods.updateReceiver(
        new_receiver
      ).accounts({
        distributor:distributorPda,
        adminAuth:adminAuth.publicKey
      }).signers([adminAuth])
      .rpc().catch((e) => {console.log(e)});
      console.log("Your updateReceiver signature", tx);

      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.receiver.toString()).equals(new_receiver.toBase58());

      new_receiver = receiver.publicKey;
      tx = await program.methods.updateReceiver(
        new_receiver
      ).accounts({
        distributor:distributorPda,
        adminAuth:adminAuth.publicKey
      }).signers([adminAuth])
      .rpc();
      console.log("Your updateReceiver signature", tx);
      distributorPdaData = await program.account.merkleDistributor.fetch(distributorPda);
      expect(distributorPdaData.receiver.toString()).equals(receiver.publicKey.toBase58());
    } catch (error) {
      console.log(error);
    }


  });


});
