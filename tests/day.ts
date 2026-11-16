// The day every test's app runs on, unless the test sets its own. PathCheck reads the day on
// the device for one thing only, the banner of an old review (F18): with a fixed day no test
// starts to fail when the calendar reaches the day that banner first appears.
import { type AppWindow } from '../src/app';

export const TEST_DAY = (): Date => new Date(2026, 10, 16, 12);
/** The same window, on the tests' day. (The day stays set for the rest of the test file: every app in it runs on it.) */
export const onTestDay = (win: AppWindow): AppWindow => Object.assign(win, { today: TEST_DAY });
