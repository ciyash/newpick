//server.js
import 'dotenv/config'; 
import app from './src/app.js'; 
// import { startCronJobs } from  './src/modules/sportmonks/sportmonks.cron.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // startCronJobs()
});
   