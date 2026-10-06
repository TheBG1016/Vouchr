# Vouchr

Vouchr is a Sepolia certificate app. The Solidity contract stores public certificate names, keys, owners, and status. The Next.js app in `frontend/` adds wallet accounts, an admin dashboard, and private encrypted attachments. The contract and its existing Sepolia deployment are unchanged.

## Run locally

1. In `frontend/`, run `npm ci`.
2. Copy `frontend/.env.example` to `frontend/.env.local` and set a Neon Postgres URL and a **private** Vercel Blob read/write token. Never commit real credentials.
3. Run `npm run db:migrate` from `frontend/`. The migration script reads `frontend/.env.local` or the shell environment.
4. Run `npm run dev` in `frontend/` and open `http://localhost:3000`.
5. Sign in at `/admin/login` with the configured admin wallet. On `/admin`, generate the admin document key, save an offline copy of its downloaded JSON file and its passphrase, then activate its public key. File uploads are unavailable until this is done.
6. Other Sepolia wallets can sign up at `/signup`, create a vault password, then issue certificates and attach a PDF, JPEG, or PNG (up to 3 MB). The password is requested for each file opening.

Run `npm test` for the browser-crypto round trip and recovery test, and `npm run build` to check the production app.

## Deploy the feature branch to Vercel

The existing Vercel project currently serves the static version. For the new Next.js app, set its **Root Directory** to `frontend` and framework preset to **Next.js**. Provide `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `SEPOLIA_RPC_URL`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, and `ADMIN_WALLET_ADDRESS` for the intended Preview and Production environments. Create a **private** Blob store and a Neon Postgres database, run the migration against the intended database, then verify the branch preview. The provided admin address is public; never put a wallet private key or recovery phrase in Vercel environment variables. Merge only after the preview works. Vercel will then build the new `main` commit for production.

Do not reuse one database between isolated preview and production deployments. Admin key setup is per database. Back up the admin document key file before accepting uploads. Losing that file or its passphrase makes admin access and assisted recovery impossible for existing attachments.

## Security model and limits

- Sign in uses a one-time Sign-In with Ethereum message for Sepolia. Sessions use an opaque HttpOnly cookie. Only the configured admin wallet can access admin APIs.
- A file is encrypted in the browser using AES-256-GCM before upload. Its random file key is wrapped separately for the owner and the admin using RSA-OAEP. Vercel Blob receives ciphertext only; a private Blob store and server authorization gate downloads.
- The owner’s document private key is stored only as a password-encrypted value. The admin document private key lives in a separately downloaded encrypted file. Neither plaintext private key nor password is sent to the server. An admin must import and unlock the key file for **each** file opening.
- If an owner loses a vault password, they must sign in again with their original wallet and request recovery. The admin rewraps each file key with the separate admin document key. Losing both the vault password and access to the original wallet has no recovery path.
- Certificate names, public keys, owner addresses, and certificate status remain **public on Sepolia**. Only the attached file content is private. A user who can view a decrypted file can still copy it or take a screenshot; the app cannot prevent that.
- This release is for synthetic/demo documents. It has no formal privacy compliance review, malware scanning of decrypted content, or identity proofing. Do not upload real Aadhaar cards, driving licences, or other sensitive identity records.
