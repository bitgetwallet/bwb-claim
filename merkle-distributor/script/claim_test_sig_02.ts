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
  createKeypairFromBs58StringFile,
  hexToBytes
} from '../utils/utils';

// import { parseBalanceMap } from "../utils/evm-src/parse-balance-map";
import { parseBalanceMap } from "../utils/parse-balance-map";
import {airdropData as airdropDataRaw} from "../data/airdrop-amounts";
import { u64,TOKEN_PROGRAM_ID} from "@solana/spl-token";

import { ethers} from "ethers"
import 'dotenv/config'
import { expect } from "chai";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

const { API_URL, PRIVATE_KEY01,PRIVATE_KEY02,PRIVATE_KEY03,PRIVATE_KEY04, PRIVATE_KEY05,PRIVATE_KEY06,PRIVATE_KEY07 } = process.env;

let PRIVATE_KEY = PRIVATE_KEY05;

const provider = new ethers.providers.AlchemyProvider("mainnet", API_URL);


/// Sample Create Signature function that signs with ethers signMessage
async function createSignature(eth_signer: ethers.Wallet, solanaPublicKey: Uint8Array, amount:u64): Promise<string> {
  // keccak256 hash of the message
  let prefixMsgBytes = Buffer.from("Please sign this message: ");
  console.log("===prefixMsgBytes is", Array.from(prefixMsgBytes));
  console.log("====solanaPublicKey is", solanaPublicKey);
  const messageHash: string = ethers.utils.solidityKeccak256(['bytes','bytes','bytes'],[prefixMsgBytes, solanaPublicKey, amount.toBuffer()]);

  console.log("===messageHash is", messageHash); 
  // get hash as Uint8Array of size 32
  const messageHashBytes: Uint8Array = ethers.utils.arrayify(messageHash);
  console.log("===messageHashBytes is", messageHashBytes); 

  // Signed message that is actually this:
  // sign(keccak256("\x19Ethereum Signed Message:\n" + len(messageHash) + messageHash)))
  const signature = await eth_signer.signMessage(messageHashBytes);

  return signature;
}


( async () => {
  
  // Message we are signing
  const walletInst = new ethers.Wallet(PRIVATE_KEY, provider);
  // // Unlike Web3.js, Ethers seperates the provider instance and wallet instance, so we must also create a wallet instance
  // const signMessage = await walletInst.signMessage(message); 
  // let splitSig = splitSignature(signMessage)
  // let recovery_id = splitSig.v;
  // let signatureRS = splitSig.compact;

  // const hashedString = hashStringWithKeccak(message);
  // console.log('=======Hashed String (Keccak):', hashedString);

  // return;

  // Solana and Ethereum wallets
  const eth_signer: ethers.Wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("eth_signer is : " + eth_signer.address);

  let payer: Keypair = await getPayer();
  let cosigner: Keypair = await initializeSigner('../keys/wallet-pair-cosigner.json');
  let admin_auth = await initializeSigner('../keys/fund_account.json');
  let receiver: Keypair = await initializeSigner('../keys/receiver-keypair.json');
  let operator: Keypair = await initializeSigner('../keys/operate-keypair.json');
  let newPayer: Keypair = await initializeSigner('../keys/new-account.json');
  let programIdSelf: Keypair = await initializeSigner('../keys/merkle_owner_pId.json');

  let kpStr="2c6AvBrx1A7kgfkHM4JP8LvdtCBDiSWFdmLzhj24Wmpz3m6WP95AN9zFTAWLjabRKoAWjEay8Bo1GuViMoKG4eSh";
  let oneUser : Keypair = await createKeypairFromBs58StringFile(kpStr);
  console.log("oneUser is : " + oneUser.publicKey);

  console.log("payer is : " + payer.publicKey);
  console.log("cosigner is : " + cosigner.publicKey);
  console.log("admin_auth is : " + admin_auth.publicKey);
  console.log("newPayer is : " + newPayer.publicKey.toBase58());
  console.log("programIdSelf is : " + programIdSelf.publicKey.toBase58());
  console.log("cosigner is : " + cosigner.publicKey);

  let token_mint = new PublicKey("83QLg6QKjfFCgoFWTx8x2EAytbAwVgA5G1mtAcsnybtp");
  let payer_ata = new PublicKey("AR1aJmL5jWmV53bQXSQaHNvB6uqmbC9yH1yVqhRnHvvi");
  let newPayer_ata = new PublicKey('Bx66barTesm9yjcvRd8QSedgpxphBY8EfgbvgXUthDGe');
  // payer_ata = newPayer_ata;

  let payer01: Keypair = newPayer;
  // let publickey = payer01.publicKey.toBytes();
  let oneUserPda = new PublicKey("Hoe8pY5HbKd837pVApzLnf5DFw7GDFezTzUHU28Jh68s");
  payer_ata = oneUserPda;
  let publickey = payer_ata.toBytes();
  console.log("publickey Array is", Array.from(publickey));

  let evmClaimer = eth_signer.address;
  const { claims, merkleRoot, tokenTotal } = parseBalanceMap(airdropDataRaw);
  // let root: number[] = Array.from(Buffer.from(merkleRoot, 'utf8'));
  let root: number[] = Array.from(merkleRoot);
  let maxTotalClaim = new u64(tokenTotal);
  let maxNumNodes = new u64(Object.keys(claims).length);
  
  let evmClaimer01Claim = claims[evmClaimer];
  console.log("claims[evmClaimer01] is", evmClaimer01Claim);

  let proof = evmClaimer01Claim.proof.map(buffer => Array.from(buffer));
  let index = new u64(evmClaimer01Claim.index);
  let amount = new u64(evmClaimer01Claim.amount);
  let evmClaimer01Bytes =await hexToBytes(evmClaimer);

  // Stuff
  let eth_address: string; // Ethereum address to be recovered and checked against
  let full_sig: string; // 64 bytes + recovery byte
  let signature: Uint8Array; // 64 bytes of sig
  let recoveryId: number; // recovery byte (u8)
  let actual_message: Buffer; // actual signed message with Ethereum Message prefix

  // Signature
  // Full sig consists of 64 bytes + recovery byte

  // amount = new u64(6);
  // publickey = new PublicKey("EpB88VhQKMYRJYChn7XpYRCt1jkqqjMvt5k8GFq4VHvM").toBytes();
  
  
  full_sig = await createSignature(eth_signer, publickey, amount);
  console.log("full_sig is", full_sig);


  let full_sig_bytes = ethers.utils.arrayify(full_sig);
  signature = full_sig_bytes.slice(0, 64);
  recoveryId = full_sig_bytes[64] - 27;

  let tmp = ethers.utils.solidityKeccak256(['bytes','bytes'],[publickey, amount.toBuffer()]);
  console.log("amount.toBuffer is",Array.from(amount.toBuffer()));

  let prefixMsgBytes = Buffer.from("Please sign this message: ");
  console.log("===prefixMsgBytes is", Array.from(prefixMsgBytes));
  let msg_digest = ethers.utils.arrayify(
    ethers.utils.solidityKeccak256(['bytes','bytes','bytes'],[prefixMsgBytes, publickey, amount.toBuffer()])
  );
  console.log("==== msg_digest is ====", msg_digest);
  actual_message = Buffer.concat([
      Buffer.from('\x19Ethereum Signed Message:\n32'),
      msg_digest,
  ]);
  console.log("actual_message is", Array.from(actual_message));

  // Calculated Ethereum Address (20 bytes) from public key (32 bytes)
  eth_address = ethers.utils
      .computeAddress(eth_signer.publicKey)
      .slice(2);

  process.env.ANCHOR_WALLET = process.env.HOME + '/.config/solana/id.json';
  //process.env.ANCHOR_PROVIDER_URL = 'https://convincing-damp-leaf.solana-mainnet.quiknode.pro/edde6ea1d584780dce63a8d70cb673b94dd025a8/';
  // process.env.ANCHOR_PROVIDER_URL = 'https://api.mainnet-beta.solana.com';
  process.env.ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  const program = anchor.workspace.MerkleDistributor as Program<MerkleDistributor>;


  // let kp = Keypair.generate();
  // console.log("kp sk is",kp.secretKey);
  // console.log("kp pk is",kp.publicKey.toBase58());

  // return;


  let [distributorPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("MerkleDistributor")],
    program.programId
  );


  let evmClaimer01 = "0x1D2440612571006CFAE090A9C8198a4a4e9b0a61"//地址大小写区分
  let evmClaimer02 = "0xAc0E6Bf367Fd747b975914601A0A2F482d10Db80"
  let evmClaimer03 = "0x2c4DFAb84C64Ca6a4676D022f39f87c21096e93D"

  let [claimStatusPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ClaimStatus"), distributorPda.toBuffer() ,Buffer.from(evmClaimer.slice(2), 'hex')],
    program.programId
  );


  let [tokenVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_vault")],
    program.programId
  );

  // const [userATAaddress] = await PublicKey.findProgramAddress(
  //   [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
  //   associatedTokenProgramId
  // );

  console.log("distributorPda: " + distributorPda);
  console.log("claimStatusPda: " + claimStatusPda);
  console.log("tokenVaultPda: " + tokenVaultPda);

  let now_time = Date.now();
  let time_stamp = (now_time/1000).toFixed();
  console.log("now_time is",time_stamp);

  // let tx = await program.methods.newDistributor(
  //   root,
  //   maxTotalClaim,
  //   maxNumNodes,
  //   new anchor.BN(time_stamp),
  //   cosigner.publicKey, admin_auth.publicKey,receiver.publicKey,operator.publicKey
  // ).accounts({
  //   adminAuth: admin_auth.publicKey,
  //   distributor: distributorPda,
  //   tokenVault:tokenVaultPda,
  //   mint: token_mint,
  //   systemProgram: SystemProgram.programId,
  //   tokenProgram: TOKEN_PROGRAM_ID
  // }).signers([admin_auth])
  // .rpc();

  // let tx = await program.methods.updateDistributor(
  //   root,
  //   maxTotalClaim,
  //   maxNumNodes
  // ).accounts({
    
  //   adminAuth: admin_auth.publicKey,
  //   distributor: distributorPda,
  // }).signers([admin_auth])
  // .rpc();

  // console.log("Your transaction tx", tx);


  let distributorData = await program.account.merkleDistributor.fetch(distributorPda);
  console.log("distributorData is", distributorData);

  let toTokenAccountPda = payer_ata;

  // payer = newPayer;
  payer = oneUser;
  
  console.log("TOKEN_PROGRAM_ID is", TOKEN_PROGRAM_ID);
  console.log("ethers.utils.arrayify('0x' + eth_address)", '0x' + eth_address);

  console.log("== actual_message is ==", Array.from(actual_message));
  console.log("== signature is ==", signature);
  console.log("== recoveryId is ==", recoveryId);

  // let tx = await program.methods.claim(
  // let tx = await program.methods.claimTestNode(
  // let tx = await program.methods.claimTestMerkle(
  let tx = await program.methods.claimTestEvmSign(
    Array.from(ethers.utils.arrayify('0x' + eth_address)),//evm
    index,
    amount,
    proof,

    Buffer.from(actual_message),
    Array.from(signature),//r+s
    recoveryId//v
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
  .signers([payer,cosigner])
  .rpc({
    skipPreflight:false
  }).catch(e => console.error(e));

  console.log("Your transaction signature", tx);

  let claimStatusPdaData = await program.account.claimStatus.fetch(claimStatusPda);
  console.log("claimStatusPdaData", claimStatusPdaData.claimedAt.toString());
  console.log("claimStatusPdaData", claimStatusPdaData);

  // let transferAmount = new anchor.BN(3e9);
  // let tx = await program.methods.withdrawBwbToken(transferAmount).accounts({
  //   cosigner: cosigner.publicKey,
  //   distributor: distributorPda,
  //   fromTokenAccount:tokenVaultPda,
  //   toTokenAccount:payer_ata,
  //   tokenProgram: TOKEN_PROGRAM_ID
  // }).signers([cosigner])
  // .rpc().catch(e => console.error(e));

  // console.log("Your transaction tx", tx);


  // let oneTokenAccount = new PublicKey("FM3wTuHugJaZqyWthnyVAJrQVfG7LaTBciSYkPjaNGEL");
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
