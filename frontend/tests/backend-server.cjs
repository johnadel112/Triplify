// Disposable integration server only. Never reads the project's backend .env.
/* eslint-disable @typescript-eslint/no-require-imports -- Load the existing CommonJS Nest build with its own dependencies. */
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { randomBytes } = require("node:crypto");
const backend = createRequire(resolve(__dirname, "../../backend/package.json"));
backend("reflect-metadata");
const { MongoMemoryReplSet } = backend("mongodb-memory-server");
const { NestFactory } = backend("@nestjs/core");
const { getModelToken } = backend("@nestjs/mongoose");
const { hash } = backend("bcryptjs");
async function main() {
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "7.0.24" },
  });
  Object.assign(process.env, {
    NODE_ENV: "test",
    MONGODB_URI: mongo.getUri(),
    MONGODB_DIRECT_HOSTS: "",
    MONGODB_REPLICA_SET: "",
    MONGODB_DNS_SERVERS: "",
    JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
    FRONTEND_URL: "http://localhost:3001",
    COOKIE_SECURE: "false",
    COOKIE_SAME_SITE: "lax",
    MAIL_MODE: "disabled",
    MEDIA_STORAGE: "local",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
  });
  const { AppModule } = backend("./dist/src/app.module.js");
  const { configureApp } = backend("./dist/src/bootstrap.js");
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.init();
  const model = (name) => app.get(getModelToken(name));
  const passwordHash = await hash("Disposable12345", 12);
  const traveler = await model("User").create({
    _id: "000000000000000000000101",
    name: "Demo Traveler",
    email: "traveler@example.test",
    passwordHash,
    role: "USER",
  });
  await model("User").create({
    name: "Demo Administrator",
    email: "admin@example.test",
    passwordHash,
    role: "ADMIN",
  });
  await model("User").create({
    name: "Suspended Traveler",
    email: "suspended@example.test",
    passwordHash,
    role: "USER",
    status: "SUSPENDED",
  });
  await model("User").create({
    name: "Locked Traveler",
    email: "locked@example.test",
    passwordHash,
    role: "USER",
    lockedUntil: new Date(Date.now() + 3600000),
  });
  await model("Currency").create([
    { code: "USD", name: "US Dollar", symbol: "$", minorUnits: 2 },
    { code: "EUR", name: "Euro", symbol: "€", minorUnits: 2 },
  ]);
  await model("AirlineProfile").create({
    _id: "000000000000000000000201",
    name: "Demo Airline",
    code: "DX",
    active: true,
  });
  const departure = new Date("2027-06-01T12:00:00Z");
  const arrival = new Date("2027-06-01T16:00:00Z");
  const flight = await model("Flight").create({
    airlineId: "000000000000000000000201",
    flightNumber: "DX101",
    departureAirport: "CAI",
    arrivalAirport: "FRA",
    departureTimeUtc: departure,
    arrivalTimeUtc: arrival,
    departureDate: "2027-06-01",
    cabins: { economy: { seatCount: 100, price: 250 } },
    currency: "USD",
  });
  await model("FlightBooking").create({
    userId: traveler._id,
    reference: "DEMO-INSPECT-01",
    status: "CONFIRMED",
    legs: [
      {
        flightId: flight._id,
        flightNumber: "DX101",
        cabinClass: "economy",
        departureAirport: "CAI",
        arrivalAirport: "FRA",
        departureTime: departure,
        arrivalTime: arrival,
        farePerSeat: 250,
        baggageCost: 0,
        legTotal: 250,
      },
    ],
    passengers: [],
    seatCount: 1,
    currency: "USD",
    totalPrice: 250,
    firstDeparture: departure,
    lastDeparture: departure,
  });
  const post = await model("BlogPost").create({
    authorId: traveler._id,
    title: "Demonstration travel journal",
    body: "Seeded content for the moderation demonstration.",
    status: "PUBLISHED",
  });
  await model("Report").create({
    reporterId: traveler._id,
    targetType: "POST",
    targetId: String(post._id),
    reason: "Demonstration report for administrator review",
    status: "OPEN",
  });
  await app.listen(3000, "127.0.0.1");
  process.stdout.write("Disposable Nest API ready on 3000\n");
  const stop = async () => {
    await app.close();
    await mongo.stop();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch((error) => {
  process.stderr.write(String(error.message));
  process.exit(1);
});
