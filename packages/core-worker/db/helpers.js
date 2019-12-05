import { WorkStatus } from './schema';
import { WorkQueue } from './collections';

export const getWorkStatus = work => {
  if (!work.started && !work.finished) {
    return WorkStatus.NEW;
  }
  if (work.started && !work.finished) {
    return WorkStatus.ALLOCATED;
  }
  if (work.started && work.finished && work.success) {
    return WorkStatus.SUCCESS;
  }
  if (work.started && work.finished && !work.success) {
    return WorkStatus.FAILED;
  }

  console.warn('Unexpected work status', work);
  throw new Error('Unexpected work status');
};

WorkQueue.helpers({
  status() {
    return getWorkStatus(this);
  }
});

export default () => {};
