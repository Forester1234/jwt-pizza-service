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
let userToken;
let userEmail;

beforeAll(async () => {
  const admin = await createAdminUser();

  const loginRes = await request(app)
    .put('/api/auth')
    .send(admin);

  adminToken = loginRes.body.token;

  const normalUser = {
    name: randomName(),
    email: randomName() + '@user.com',
    password: 'notenoughsecrets'
  };

  userEmail = normalUser.email;

  const userLogin = await request(app)
    .post('/api/auth')
    .send(normalUser);

  userToken = userLogin.body.token;
});



test('getFranchises', async () => {
    const res = await request(app)
        .get('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.franchises).toBeInstanceOf(Array);
    expect(typeof res.body.more).toBe('boolean');
});

test('adminGetUserFranchises', async () => {
    const res = await request(app)
        .get(`/api/franchise/${adminToken.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
});

test('userGetOwnFranchises', async () => {
    const res = await request(app)
        .get(`/api/franchise/${userToken.id}`)
        .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
});

test('createFranchise', async () => {
    const franchise = {
        name: `franchise-${randomName()}`,
        admins: [
        {
            email: userEmail,
        },
        ],
    };

    const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(franchise);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(franchise.name);
    expect(res.body.admins).toBeInstanceOf(Array);
});

test('deleteFranchise', async () => {
    const franchise = {
        name: `franchise-${randomName()}`,
        admins: [
            {
                email: userEmail,
            },
        ],
    };

    const createRes = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(franchise);

    const franchiseId = createRes.body.id;

    const res = await request(app)
        .delete(`/api/franchise/${franchiseId}`)
        .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'franchise deleted');
});

test('createStore', async () => {
    const franchise = {
        name: `franchise-${randomName()}`,
        admins: [
        {
            email: userEmail,
        },
        ],
    };

    const createFranchiseRes = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(franchise);

    expect(createFranchiseRes.status).toBe(200);

    const franchiseId = createFranchiseRes.body.id;

    const store = {
        name: `store-${randomName()}`,
    };

    const res = await request(app)
        .post(`/api/franchise/${franchiseId}/store`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(store);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(store.name);
    expect(res.body.franchiseId).toBe(franchiseId);
});

test('deleteStore', async () => {
    const franchise = {
        name: `franchise-${randomName()}`,
        admins: [
        {
            email: userEmail,
        },
        ],
    };

    const createFranchiseRes = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(franchise);

    expect(createFranchiseRes.status).toBe(200);

    const franchiseId = createFranchiseRes.body.id;

    const store = {
        name: `store-${randomName()}`,
    };

    const createStoreRes = await request(app)
        .post(`/api/franchise/${franchiseId}/store`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(store);

    expect(createStoreRes.status).toBe(200);

    const storeId = createStoreRes.body.id;

    const res = await request(app)
        .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'store deleted');
});
