const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(30000);

describe('OTP integration - happy path', () => {
  let mongod;
  let app;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;
    process.env.JWT_SECRET = 'testsecret';
    // require app after env vars so it connects to in-memory mongo
    app = require('../server');
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    try {
      await mongoose.disconnect();
    } catch (e) {
      console.warn('mongoose.disconnect failed during afterAll:', e?.message || e);
    }
    if (mongod) {
      try {
        await mongod.stop();
      } catch (err) {
        // On some Windows environments mongod stop may try to kill a process and raise EPERM.
        // Log and attempt cleanup gracefully without failing the test suite.
        console.warn('mongod.stop() failed (continuing):', err?.message || err);
        try {
          if (typeof mongod.cleanup === 'function') await mongod.cleanup();
        } catch (cleanupErr) {
          console.warn('mongod.cleanup() also failed:', cleanupErr?.message || cleanupErr);
        }
      }
    }
  });

  test('register provider and rider, book, accept -> generate and verify OTP', async () => {
    // register provider
    const prov = await request(app).post('/api/auth/register').send({
      name: 'Prov Test',
      email: 'prov-test@example.com',
      password: 'Password1',
      gender: 'Male',
      age: 34,
      mobileNumber: '9999999010'
    });
    expect(prov.status).toBe(201);
    const providerToken = prov.body.token;

    // promote to provider
    await request(app).put('/api/auth/role').set('x-auth-token', providerToken).send({ role: 'provider' });

    // register rider
    const rider = await request(app).post('/api/auth/register').send({
      name: 'Rider Test',
      email: 'rider-test@example.com',
      password: 'Password1',
      gender: 'Female',
      age: 28,
      mobileNumber: '9999999020'
    });
    expect(rider.status).toBe(201);
    const riderToken = rider.body.token;

    // get rider id
    const riderMe = await request(app).get('/api/auth/me').set('x-auth-token', riderToken);
    const riderId = riderMe.body._id || riderMe.body.id || (riderMe.body.user && riderMe.body.user._id);

    // create ride by provider
    // provide provider details first (server requires providerDetails before creating a ride)
    const provDetails = await request(app).post('/api/provider/details').set('x-auth-token', providerToken).send({
      vehicleCategory: 'Car',
      vehicleNumber: 'MH12AB1234',
      rcNumber: 'DL12AB1234',
      insuranceNumber: 'INS987654321',
      licenseNumber: 'DL9876543210',
      aadharNumber: '123456789012',
      vehicleType: 'Sedan'
    });
    expect(provDetails.status).toBe(201);

    const rideRes = await request(app).post('/api/ride').set('x-auth-token', providerToken).send({
      startPoint: 'Home',
      destination: 'Work',
      startTime: new Date(Date.now() + 3600000).toISOString(),
      rideCost: 20,
      seats: 2
    });
    expect(rideRes.status).toBe(201);
    const rideId = rideRes.body.ride._id || rideRes.body.ride.id || rideRes.body.ride;

    // rider books the ride
    await request(app).post(`/api/rides/book/${rideId}`).set('x-auth-token', riderToken);

    // provider accepts -> OTP generated
    const accept = await request(app).post(`/api/provider/requests/${rideId}/${riderId}/accept`).set('x-auth-token', providerToken);
    expect(accept.status).toBe(200);

    // fetch rider notifications and extract OTP
    const noti = await request(app).get('/api/rider/notifications').set('x-auth-token', riderToken);
    expect(noti.status).toBe(200);
    const otpNoti = noti.body.notifications.find(n => /Your boarding OTP is:\s*\d{4}/.test(n.message));
    expect(otpNoti).toBeDefined();
    const match = otpNoti.message.match(/Your boarding OTP is:\s*(\d{4})/);
    expect(match).toBeTruthy();
    const otp = match[1];

    // provider verifies the OTP
    const verify = await request(app).post('/api/otp/verify').set('x-auth-token', providerToken).send({ rideId, passengerId: riderId, otp });
    expect(verify.status).toBe(200);
    expect(verify.body.message).toMatch(/OTP verified/i);
  });
});

