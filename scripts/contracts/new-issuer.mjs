import { randomBytes } from "node:crypto";
import { Wallet } from "ethers";

const issuer = Wallet.createRandom();
console.log("Fuji testnet only. Put the private key and secret only in your local .env; never commit them.");
console.log(`REGISTRATION_ISSUER_ADDRESS=${issuer.address}`);
console.log(`UNIPASS_REGISTRATION_ISSUER_PRIVATE_KEY=${issuer.privateKey}`);
console.log(`EMAIL_NULLIFIER_SECRET=${randomBytes(32).toString("hex")}`);
