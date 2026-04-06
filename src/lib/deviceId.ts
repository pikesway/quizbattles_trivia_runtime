const DEVICE_ID_KEY = 'trivia_device_id';

function generateDeviceId(): string {
  return crypto.randomUUID();
}

export function getOrCreateDeviceId(): string {
  try {
    const existingId = localStorage.getItem(DEVICE_ID_KEY);

    if (existingId) {
      return existingId;
    }

    const newId = generateDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch (error) {
    console.error('Failed to access localStorage for device ID:', error);
    return generateDeviceId();
  }
}

export function getDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch (error) {
    console.error('Failed to access localStorage for device ID:', error);
    return null;
  }
}
