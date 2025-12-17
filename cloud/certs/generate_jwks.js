const fs = require('node:fs');

const algorithm = {
  // name: 'RSA-PSS',
  // modulusLength: 4096,
  // publicExponent: new Uint8Array([1, 0, 1]),
  // hash: 'SHA-256',
  name: 'ECDSA',
  namedCurve: 'P-384',
};

const run = async () => {
  // const { publicKey, privateKey } = await jose.generateKeyPair('RS256');
  // console.log(publicKey);
  // console.log(privateKey);

  // const exported = await crypto.subtle.exportKey('jwk', publicKey);
  // console.log(exported);

  // See https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/generateKey
  let key = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const public = await crypto.subtle.exportKey('jwk', key.publicKey);
  const private = await crypto.subtle.exportKey('jwk', key.privateKey);
  // const imported = await crypto.subtle.importKey('jwk', private, algorithm,
  //   false, ['sign']);
  // console.log(imported);

  fs.writeFileSync('private.jwk', JSON.stringify(private))
  fs.writeFileSync('public.jwks', JSON.stringify({keys: [public]}))
};



run();
