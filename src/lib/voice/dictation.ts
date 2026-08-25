/**
 * Speech to text, on the device.
 *
 * The audio never leaves the phone and never reaches Claude — the browser
 * transcribes, and the model receives the resulting text. That is cheaper, much
 * faster, and a better prompt than audio would be.
 *
 * Chrome on Android only, which matches where this app runs. Everywhere else
 * `isDictationAvailable()` is false and the button simply isn't rendered —
 * there is no fallback to build, because typing already is the fallback.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function constructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isDictationAvailable(): boolean {
  return constructor() !== undefined;
}

export type Dictation = { stop: () => void };

/**
 * Start listening. `onText` receives the transcript so far, interim guesses
 * included — showing words as they land is what makes it feel like it is
 * working rather than hung.
 */
export function startDictation(
  onText: (text: string) => void,
  onEnd: (error?: string) => void,
): Dictation | null {
  const Recognition = constructor();
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = "en-GB";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }
    onText(transcript.trim());
  };

  // "no-speech" and "aborted" are what tapping the button and changing your
  // mind look like. Not worth showing an error for.
  recognition.onerror = (event) =>
    onEnd(["no-speech", "aborted"].includes(event.error) ? undefined : event.error);
  recognition.onend = () => onEnd();

  recognition.start();
  return { stop: () => recognition.stop() };
}
