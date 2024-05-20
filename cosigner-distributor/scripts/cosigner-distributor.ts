import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CosignerDistributor } from "../target/types/cosigner_distributor";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  ComputeBudgetProgram
  
} from '@solana/web3.js';

import {
  getPayer,
  initializeSigner,
  hexToBytes,
  createKeypairFromBs58StringFile
} from '../utils/utils';

import {TOKEN_PROGRAM_ID} from "@solana/spl-token";

import {privateKey} from "../keys/testKey";

let payer: Keypair;
let cosigner: Keypair;

process.env.ANCHOR_PROVIDER_URL = 'https://special-compatible-meadow.solana-mainnet.quiknode.pro/09ca4f4810f96f06bc274c89314e46f0f433e93e';
// process.env.ANCHOR_PROVIDER_URL = 'https://api.mainnet-beta.solana.com';
process.env.ANCHOR_WALLET = process.env.HOME + '/.config/solana/id.json';
// process.env.ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
const provider = anchor.AnchorProvider.env();

async function createAndSendV0Tx(
  txInstructions: anchor.web3.TransactionInstruction[],
  isNeedALT: boolean
) {

  //const lookupTable01 = (await provider.connection.getAddressLookupTable(LOOKUP_TABLE_ADDRESS_01)).value;

  // Step 1 - Fetch the latest blockhash
  let recentBlockhash = await provider.connection.getLatestBlockhash(
    "confirmed"
  );
  console.log(
    "   ✅ - Fetched latest blockhash. Last Valid Height:",
    recentBlockhash.lastValidBlockHeight
  );

  // Step 2 - Generate Transaction Message
  let messageV0;
  let testUser =await createKeypairFromBs58StringFile(privateKey);
  payer = testUser;
  cosigner= await initializeSigner('../keys/wallet-pair-cosigner.json');
  console.log("payer is", payer.publicKey);
  if(isNeedALT) {
    console.log("   ✅ - need alt");
    messageV0 = new anchor.web3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: txInstructions,
    }).compileToV0Message();
  } else {
    console.log("   ✅ - not need alt");
    messageV0 = new anchor.web3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: txInstructions,
    }).compileToV0Message();
  }
  console.log("   ✅ - Compiled Transaction Message");
  const transactionV0 = new anchor.web3.VersionedTransaction(messageV0);

  // Step 3 - Sign your transactionV0 with the required `Signers`
  //provider.wallet.signTransaction(transactionV0);
  
  transactionV0.sign([payer, cosigner]);


  console.log("   ✅ - Transaction Signed");

  // // Step 4 - Send our v0 transactionV0 to the cluster
  
  let txid:any;
  try {
      txid = await provider.connection.sendTransaction(transactionV0, {
      maxRetries: 10, 
      skipPreflight:false
    });
  } catch (error) {
    console.log("error is", error);
  }

  console.log("   ✅ - Transaction sent to network");

  // Step 5 - Confirm Transaction
  const confirmation = await provider.connection.confirmTransaction({
    signature: txid,
    blockhash: recentBlockhash.blockhash,
    lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
  });
  if (confirmation.value.err) {
    throw new Error(
      `   ❌ - Transaction not confirmed.\nReason: ${confirmation.value.err}`
    );
  }

  console.log("🎉 Transaction Succesfully Confirmed! txid is \n", txid);
  // let result = await program.account.actionState.fetch(actionState);
  // console.log("Robot action state details: ", result);
}


( async () => {
  
  let payer: Keypair = await getPayer();
  let cosigner: Keypair = await initializeSigner('../keys/wallet-pair-cosigner.json');
  let admin_auth = await initializeSigner('../keys/fund_account.json');
  let receiver: Keypair = await initializeSigner('../keys/receiver-keypair.json');
  let operator: Keypair = await initializeSigner('../keys/operate-keypair.json');
  let programIdSelf: Keypair = await initializeSigner('../keys/cosigner_distributor-keypair.json');
  console.log("payer is : " + payer.publicKey);
  console.log("cosigner is : " + cosigner.publicKey);
  console.log("admin_auth is : " + admin_auth.publicKey);
  console.log("receiver is : " + receiver.publicKey.toBase58());
  console.log("operator is : " + operator.publicKey.toBase58());
  console.log("programIdSelf is : " + programIdSelf.publicKey.toBase58());

  //let token_mint = new PublicKey("83QLg6QKjfFCgoFWTx8x2EAytbAwVgA5G1mtAcsnybtp");//devnet
  let token_mint = new PublicKey("G1GV35DHibxUDJtMC9DBRzruqhLhEe6tr85WQ73XoPJ3");//mainnet TT02
  //let payer_ata = new PublicKey("AR1aJmL5jWmV53bQXSQaHNvB6uqmbC9yH1yVqhRnHvvi");//devnet
  let payer_ata = new PublicKey("7hrkCMt3rGgk1S72RW5MkXtSbn6bZ8XtgkXodjfYjf8U");//mainnet
  let receiver_ata = new PublicKey('Bx66barTesm9yjcvRd8QSedgpxphBY8EfgbvgXUthDGe');
  // payer_ata = receiver_ata;

  process.env.ANCHOR_WALLET = process.env.HOME + '/.config/solana/id.json';
  // process.env.ANCHOR_WALLET = '/Users/xp/workshop_01/gitlab-projects/bwb-contract/solana/cosigner-distributor/keys/testUser.json';
  process.env.ANCHOR_PROVIDER_URL = 'https://special-compatible-meadow.solana-mainnet.quiknode.pro/09ca4f4810f96f06bc274c89314e46f0f433e93e';
  // process.env.ANCHOR_PROVIDER_URL = 'https://api.mainnet-beta.solana.com';
  // process.env.ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  //const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

  const program = anchor.workspace.CosignerDistributor as Program<CosignerDistributor>;
  console.log("===program is: ", program.programId);

  let [distributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("MerkleDistributor")],
    program.programId
  );


  let evmClaimer01 = "0x1D2440612571006CFAE090A9C8198a4a4e9b0a61"//地址大小写区分
  let evmClaimer02 = "0xAc0E6Bf367Fd747b975914601A0A2F482d10Db80"
  let evmClaimer03 = "0x2c4DFAb84C64Ca6a4676D022f39f87c21096e93D"
  let evmClaimer04 = "0x051F5927B506f0623D49A81A55C713d1613773A1";

  let evmClaimer = evmClaimer01;
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


  let now_time = Date.now();
  let time_stamp = (now_time/1000).toFixed();
  console.log("now_time is",time_stamp);

  // let tx = await program.methods.newDistributor(
  //   new anchor.BN(time_stamp),
  //   cosigner.publicKey, admin_auth.publicKey,receiver.publicKey,operator.publicKey
  // ).accounts({
    
  //   payer: admin_auth.publicKey,
  //   distributor: distributorPda,
  //   tokenVault:tokenVaultPda,
  //   mint: token_mint,
  //   systemProgram: SystemProgram.programId,
  //   tokenProgram: TOKEN_PROGRAM_ID
  // }).signers([admin_auth])
  // .rpc();

  // console.log("Your transaction signature", tx);

  // let tx = await program.methods.updateDistributor(
  //   cosigner.publicKey
  // ).accounts({
  //   adminAuth: admin_auth.publicKey,
  //   distributor: distributorPda,
  // }).signers([admin_auth])
  // .rpc();
  // console.log("Your transaction signature", tx);


  let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
  console.log("distributorData is", distributorData);

  return;

  //payer = receiver;

  const PRIORITY_RATE = 10000; // MICRO_LAMPORTS 
  const PRIORITY_FEE_IX = ComputeBudgetProgram.setComputeUnitPrice({microLamports: PRIORITY_RATE});
  
  console.log("payer is", payer.publicKey);
  let transferAmount = new anchor.BN(5e14);
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
  .preInstructions(
    [
      PRIORITY_FEE_IX
    ]
  )
  .signers([payer,cosigner])
  .rpc({
    skipPreflight:false
  }).catch(e => console.error(e));

  console.log("Your transaction signature", tx);

  // let claimIx = await program.methods.claim(
  //   //let tx = await program.methods.claimTestNode(
  //     evmClaimerBytes,
  //     transferAmount,
  //   ).accounts({
  //     distributor: distributorPda,
  //     claimStatus: claimStatusPda,
  //     mint: token_mint,
  //     fromTokenVault: tokenVaultPda,
  //     toTokenAccount:payer_ata,// one token acount// token 接收者 + amount +
  //     payer:payer.publicKey,// sender
  //     cosigner:cosigner.publicKey,
  //     systemProgram: SystemProgram.programId,
  //     tokenProgram: TOKEN_PROGRAM_ID,
  //   }).instruction();
  
  // const instructions: anchor.web3.TransactionInstruction[] = [
  //   PRIORITY_FEE_IX,
  //   claimIx
  // ];

  // await createAndSendV0Tx(instructions, false);

  let claimStatusPdaData = await program.account.claimStatus.fetch(claimStatusPda);
  console.log("claimStatusPdaData", claimStatusPdaData.claimedAt.toString());
  console.log("claimStatusPdaData", claimStatusPdaData);

  // let transferAmount = new anchor.BN(5e9);
  // let tx = await program.methods.withdrawBwbToken(transferAmount).accounts({
  //   cosigner: cosigner.publicKey,
  //   distributor: distributorPda,
  //   fromTokenAccount:tokenVaultPda,
  //   toTokenAccount:receiver_ata,
  //   tokenProgram: TOKEN_PROGRAM_ID
  // }).signers([cosigner])
  // .rpc().catch(e => console.error(e));

  // console.log("Your transaction signature", tx);


  // let oneTokenAccount = new PublicKey("VERLgogM35wkpNmHxpDLBhQ4KiGsKyDgJeEV3kZrFFH");
  // let tx = await program.methods.withdrawOtherToken(transferAmount).accounts({
  //     cosigner: cosigner.publicKey,
  //     distributor: distributorPda,
  //     mint:token_mint,
  //     fromTokenAccount:oneTokenAccount,
  //     toTokenAccount:payer_ata,
  //     fromAtaOwner:programIdSelf.publicKey,
  //     tokenProgram: TOKEN_PROGRAM_ID
  //   }).signers([cosigner,programIdSelf])
  //   .rpc().catch(e => console.error(e));
  
  // console.log("Your transaction signature", tx);
  
})();
