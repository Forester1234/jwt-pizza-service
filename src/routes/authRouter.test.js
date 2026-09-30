const request = require('supertest');
const app = require('../service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

beforeAll(async () => {
  testUser.email = randomName() + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('loginInvalid', async () => {
  const loginE = await request(app).put('/api/auth').send({ ...testUser, email: 'wrong' });
  expect(loginE.status).toBe(404);
  expect(loginE.body.message).toBe('unknown user');
  const loginP = await request(app).put('/api/auth').send({ ...testUser, password: 'wrong' });
  expect(loginP.status).toBe(404);
  expect(loginP.body.message).toBe('unknown user');
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

test('register', async () => {
  const registerRes = await request(app).post('/api/auth').send(testUser);
  expect(registerRes.status).toBe(200);
  expectValidJwt(registerRes.body.token);
});

test('registerEmptyField', async () => {
  const registerE = await request(app).post('/api/auth').send({ ...testUser, email: '' });
  expect(registerE.status).toBe(400);
  expect(registerE.body.message).toBe('name, email, and password are required');
  const registerP = await request(app).post('/api/auth').send({ ...testUser, password: '' });
  expect(registerP.status).toBe(400);
  expect(registerP.body.message).toBe('name, email, and password are required');
  const registerN = await request(app).post('/api/auth').send({ ...testUser, name: '' });
  expect(registerN.status).toBe(400);
  expect(registerN.body.message).toBe('name, email, and password are required');
});

test('logout', async () => {
  const logoutRes = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');
});

test('logoutNoAuth', async () => {
  const logoutRes = await request(app).delete('/api/auth');
  expect(logoutRes.status).toBe(401);
  expect(logoutRes.body.message).toBe('unauthorized');
});
