const audioContext = typeof window !== 'undefined' 
  ? new (window.AudioContext || (window as any).webkitAudioContext)() 
  : null;

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
  if (!audioContext) return;
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  
  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

export function playSendSound() {
  playTone(880, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(1100, 0.08, 'sine', 0.15), 50);
}

export function playReceiveSound() {
  playTone(660, 0.12, 'sine', 0.2);
  setTimeout(() => playTone(880, 0.1, 'sine', 0.25), 80);
  setTimeout(() => playTone(1320, 0.08, 'sine', 0.15), 140);
}

export function playErrorSound() {
  playTone(330, 0.15, 'square', 0.15);
  setTimeout(() => playTone(220, 0.2, 'square', 0.1), 100);
}
