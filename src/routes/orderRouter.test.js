const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';

  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

let adminToken;

beforeAll(async () => {
  const admin = await createAdminUser();

  const loginRes = await request(app)
    .put('/api/auth')
    .send(admin);

  adminToken = loginRes.body.token;
});

test('getMenu', async () => {
    const res = await request(app)
        .get('/api/order/menu')
        .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
});

test('addMenuItem', async () => {
    const menuItem = {
    title: randomName(),
    description: 'A delicious pizza',
    image: 'pizza.jpg',
    price: 10,
  };

  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(menuItem);

  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Array);

  expect(res.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: menuItem.title,
        description: menuItem.description,
        image: menuItem.image,
        price: menuItem.price,
      }),
    ])
  );
});

test('getOrders', async () => {
  const res = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toBeInstanceOf(Object);
});
