// Free-text input is deliberately stricter than provider-owned instrument names.
const PLAIN_TEXT = /^[\p{L}\p{M}\p{N} ]+$/u;
const HAS_LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;
const EMAIL = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function isPlainText(value) {
  return typeof value === "string" && PLAIN_TEXT.test(value) && HAS_LETTER_OR_NUMBER.test(value);
}

function validEmail(value) {
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  const email = value.trim();
  return email.split("@")[0].length <= 64 && EMAIL.test(email);
}

module.exports = { isPlainText, validEmail, DECIMAL };
