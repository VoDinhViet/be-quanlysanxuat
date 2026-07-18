export enum CacheKey {
  EMAIL_VERIFICATION = 'email_verification:%s',
  SESSION_BLACKLIST = 'session_blacklist:%s',
  SESSION_HASH = 'session_hash:%s',
  // Authorization: maps a credential (JWT sub) to its role id, and a role id to its permission
  // codes. Two levels so each can be invalidated independently — a role edit clears only
  // ROLE_PERMISSIONS, a user's role reassignment clears only CREDENTIAL_ROLE.
  CREDENTIAL_ROLE = 'credential_role:%s',
  ROLE_PERMISSIONS = 'role_permissions:%s',
}
