import { formatDate } from '../dates.js';
import DayPlan from './DayPlan.jsx';
import Modal from './Modal.jsx';

export default function DayModal({ date, onClose, ...props }) {
  return (
    <Modal title={formatDate(date, { withWeekday: true })} onClose={onClose}>
      <DayPlan date={date} {...props} />
    </Modal>
  );
}
