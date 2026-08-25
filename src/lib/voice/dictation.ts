/**
 * Speech to text, via the browser's own `SpeechRecognition`.
 *
 * No model of ours is involved: this is the Web Speech API, and Claude only
 * ever receives the text it returns. That is cheaper, much faster, and a better
 * prompt than audio would be.
 *
 * **It is not on-device, and the comment here used to claim it was.** Chrome
 * implements this by streaming the audio to Google's speech servers. Android
 * can recognise locally in some configurations, but it is not guaranteed and
 * nothing here requests it. The accurate statement is that the audio goes to
 * Google and never to Anthropic — worth saying precisely, because "never leaves
 * the phone" is a materially stronger promise than the one this actually keeps.
 *
 * Chrome only, which matches where this app runs. Everywhere else
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
