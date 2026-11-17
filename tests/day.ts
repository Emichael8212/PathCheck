// The day every test's app runs on, unless the test sets its own. PathCheck reads the day on
// the device for one thing only, the banner of an old review (F18): with a fixed day no test
// starts to fail when the calendar reaches the day that banner first appears.
// The day is the one after the curriculum's review, worked out from the curriculum file (tests/reviewed.ts):
// a new review date moves it along.
import { type AppWindow } from '../src/app';
import { DAY_AFTER_REVIEW, at } from './reviewed';

export const TEST_DAY = (): Date => at(DAY_AFTER_REVIEW);
/** The same window, on the tests' day. (The day stays set for the rest of the test file: every app in it runs on it.) */
export const onTestDay = (win: AppWindow): AppWindow => Object.assign(win, { today: TEST_DAY });
