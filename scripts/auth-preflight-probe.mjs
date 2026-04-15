const authUrl = 'https://bytspot-api.onrender.com/trpc/auth.signup';
const loginUrl = 'https://bytspot-api.onrender.com/trpc/auth.login';
const origin = 'http://127.0.0.1:4173';
const email = `augment.probe.${Date.now()}@example.com`;
const password = 'BytspotPass123!';
const name = 'Augment Probe';

function printHeaders(response) {
  const interesting = [
    'access-control-allow-origin',
    'access-control-allow-credentials',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'vary',
  ];
  for (const key of interesting) {
    console.log(`${key}: ${response.headers.get(key) ?? ''}`);
  }
}

async function main() {
  console.log('== AUTH PREFLIGHT ==');
  const preflight = await fetch(authUrl, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  console.log(`status: ${preflight.status}`);
  printHeaders(preflight);

  console.log('\n== SIGNUP POST ==');
  const signup = await fetch(authUrl, {
    method: 'POST',
    headers: {
      Origin: origin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, name }),
  });
  console.log(`status: ${signup.status}`);
  console.log(await signup.text());

  console.log('\n== LOGIN POST ==');
  const login = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      Origin: origin,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  console.log(`status: ${login.status}`);
  console.log(await login.text());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
