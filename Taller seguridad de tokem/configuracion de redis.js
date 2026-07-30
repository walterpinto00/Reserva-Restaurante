const redis = require('redis');

const redisClient = redis.createClient({
  url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.error('Redis Error:', err));
redisClient.on('connect', () => console.log('✅ Redis conectado'));

(async () => {
  await redisClient.connect();
})();

module.exports = redisClient;