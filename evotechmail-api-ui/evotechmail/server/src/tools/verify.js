import argon2 from 'argon2';

const hash = '$argon2id$v=19$m=65536,t=3,p=4$s1eWLvYAujLE15DA3o+NGg$RmKbVs42POdV8wlIAUnE+iucyjj95uPXkvfJT1/zFY8';
const password = '!1Palestine1221';

try {
  const ok = await argon2.verify(hash, password);
  console.log('verify:', ok);
} catch (e) {
  console.error(e);
}



// -- Run form command line to verify
// cd /d E:\dev\XAMPP\htdocs\evotechmail\server
// node ./src/tools/verify.js