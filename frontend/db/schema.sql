CREATE TABLE IF NOT EXISTS users (
  address text PRIMARY KEY,
  display_name text NOT NULL,
  encryption_public_key jsonb NOT NULL,
  encrypted_private_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce text PRIMARY KEY,
  address text NOT NULL,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS auth_nonces_expiry_idx ON auth_nonces (expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  address text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_address_idx ON sessions (address);

CREATE TABLE IF NOT EXISTS admin_crypto (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  encryption_public_key jsonb NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certificates_index (
  chain_id bigint NOT NULL,
  contract_address text NOT NULL,
  cert_id bigint NOT NULL,
  owner_address text NOT NULL,
  subject_name text NOT NULL,
  fingerprint text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, contract_address, cert_id)
);
CREATE INDEX IF NOT EXISTS certificates_subject_idx ON certificates_index (lower(subject_name));
CREATE INDEX IF NOT EXISTS certificates_owner_idx ON certificates_index (owner_address);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY,
  chain_id bigint NOT NULL,
  contract_address text NOT NULL,
  cert_id bigint NOT NULL,
  owner_address text NOT NULL,
  blob_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  plain_size integer NOT NULL,
  iv text NOT NULL,
  owner_wrapped_key text NOT NULL,
  admin_wrapped_key text NOT NULL,
  admin_key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS attachments_owner_idx ON attachments (owner_address);
CREATE UNIQUE INDEX IF NOT EXISTS attachments_active_certificate_idx
  ON attachments (chain_id, contract_address, cert_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS recovery_requests (
  id uuid PRIMARY KEY,
  owner_address text NOT NULL REFERENCES users(address),
  new_public_key jsonb NOT NULL,
  new_encrypted_private_key jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS recovery_requests_owner_idx ON recovery_requests (owner_address);

CREATE TABLE IF NOT EXISTS recovery_wraps (
  request_id uuid NOT NULL REFERENCES recovery_requests(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  wrapped_key text NOT NULL,
  PRIMARY KEY (request_id, attachment_id)
);

CREATE TABLE IF NOT EXISTS access_audit (
  id uuid PRIMARY KEY,
  actor_address text NOT NULL,
  attachment_id uuid,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_audit_created_idx ON access_audit (created_at DESC);

CREATE TABLE IF NOT EXISTS request_limits (
  key text NOT NULL,
  bucket bigint NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (key, bucket)
);

CREATE OR REPLACE FUNCTION complete_vouchr_recovery(request_uuid uuid)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  request_record recovery_requests%ROWTYPE;
  attachment_count integer;
  wrap_count integer;
BEGIN
  SELECT * INTO request_record FROM recovery_requests WHERE id = request_uuid FOR UPDATE;
  IF NOT FOUND OR request_record.status <> 'pending' OR request_record.expires_at <= now() THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO attachment_count FROM attachments
  WHERE owner_address = request_record.owner_address AND deleted_at IS NULL;
  SELECT count(*) INTO wrap_count FROM recovery_wraps
  WHERE request_id = request_uuid;
  IF attachment_count <> wrap_count THEN
    RETURN false;
  END IF;

  UPDATE attachments AS a SET owner_wrapped_key = w.wrapped_key
  FROM recovery_wraps AS w
  WHERE w.request_id = request_uuid AND w.attachment_id = a.id
    AND a.owner_address = request_record.owner_address AND a.deleted_at IS NULL;
  UPDATE users SET encryption_public_key = request_record.new_public_key,
    encrypted_private_key = request_record.new_encrypted_private_key
  WHERE address = request_record.owner_address;
  UPDATE recovery_requests SET status = 'complete', completed_at = now()
  WHERE id = request_uuid;
  RETURN true;
END;
$$;
