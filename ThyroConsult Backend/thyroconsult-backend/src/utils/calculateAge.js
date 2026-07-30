// src/utils/calculateAge.js
// patients.dob is application-layer AES-256-GCM encrypted (see utils/encryption.js),
// so age can never be computed in SQL (e.g. EXTRACT(YEAR FROM AGE(...))) — the
// column has to be decrypted with decryptPHI() first, then age computed here.

function calculateAge(dobString) {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

module.exports = { calculateAge };
