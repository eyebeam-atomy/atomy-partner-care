import CryptoJS from 'crypto-js';

// 이 '마스터 키'는 나중에 Vercel 설정(.env)에 숨길 겁니다.
// 지금은 테스트를 위해 임시로 넣어둘게요.
const SECRET_KEY = process.env.NEXT_PUBLIC_CRYPTO_KEY || 'atomy_secret_key_1234';

// 1. 데이터를 외계어로 바꾸는 함수 (암호화)
export const encrypt = (text: string) => {
  if (!text) return '';
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
};

// 2. 외계어를 다시 한글로 푸는 함수 (복호화)
export const decrypt = (cipherText: string) => {
  if (!cipherText) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("복호화 중 오류 발생:", error);
    return '데이터를 읽을 수 없습니다.';
  }
};