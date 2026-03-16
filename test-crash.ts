import { AuditorService } from './src/services/auditor.service';
import { globalQueue } from './src/services/QueueManager';

async function test() {
  const id = globalQueue.addJob('https://www.nescafe-dolcegusto.com.br');
  console.log('Job added:', id);
  
  // Wait a bit to let it process
  setTimeout(() => {
    console.log(globalQueue.getJobStatus(id));
  }, 2000);
}

test();
