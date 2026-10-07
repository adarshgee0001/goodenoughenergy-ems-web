export const formatAlarmTime = (isoString: string): string => {
  const date = new Date(isoString);

  // Using 'en-GB' or similar can help force the DD MMM YYYY order, but we can also build it out if strict.
  // Actually, to guarantee the exact "03 Sep 2026, 02:00 PM" format across browsers reliably:
  const day = date.toLocaleDateString('en-US', { day: '2-digit' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.toLocaleDateString('en-US', { year: 'numeric' });

  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return `${day} ${month} ${year}, ${time}`;
};
