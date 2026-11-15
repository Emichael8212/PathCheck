// Guards the two data files the whole project is driven by. These are setup checks,
// not feature tests: feature F02 adds the tests for how the app uses the curriculum.
import { describe, expect, it } from 'vitest';
import curriculum from '../docs/curriculum/provisional-current.json';
import featureList from '../features.json';

const blockCourses = curriculum.blocks.flatMap(block => [
  ...block.required,
  ...block.choices.flatMap(choice => choice.courses),
]);

describe('curriculum data (docs/BRIEF.md §5)', () => {
  it('has block credits that add up to the 121-credit degree', () => {
    const total = curriculum.blocks.reduce((sum, block) => sum + block.credits, 0) + curriculum.electives.credits;
    expect(total).toBe(121);
    expect(curriculum.degreeCredits).toBe(121);
  });

  it('has courses in every block that add up to the block credits', () => {
    for (const block of curriculum.blocks) {
      const required = block.required.reduce((sum, course) => sum + course.credits, 0);
      const chosen = block.choices.reduce((sum, choice) => {
        const credits = new Set(choice.courses.map(course => course.credits));
        expect(credits.size, `${block.id}: courses in one choice have equal credits`).toBe(1);
        return sum + choice.choose * (choice.courses[0]?.credits ?? 0);
      }, 0);
      expect(required + chosen, block.id).toBe(block.credits);
    }
  });

  it('lists each course once', () => {
    const ids = blockCourses.map(course => course.courseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not contain the removed courses or fields', () => {
    const text = JSON.stringify(curriculum);
    expect(text).not.toMatch(/CIS-304|CIS-415/);
    expect(text).not.toMatch(/replacement|nonOffering|unresolved|historical|catalogYear/i);
  });

  it('has the elective rule: FIN 201 plus 300/400-level MGT, FIN, CIS, MKT, ACT, ECO', () => {
    expect(curriculum.electives.courseCount).toBe(3);
    expect(curriculum.electives.namedCourses).toEqual([{ courseId: 'FIN-201', title: 'Personal Finance', credits: 3 }]);
    expect([...curriculum.electives.subjectRule.prefixes].sort()).toEqual(['ACT', 'CIS', 'ECO', 'FIN', 'MGT', 'MKT']);
    expect(curriculum.electives.subjectRule.minCourseNumber).toBe(300);
    expect(curriculum.electives.subjectRule.maxCourseNumber).toBe(499);
    expect(curriculum.electives.subjectRule.creditsPerCourse).toBe(3);
  });

  it('has the four legacy-only electives, each with a title and 3 credits', () => {
    expect(curriculum.electives.legacyOnlyCourses).toEqual([
      { courseId: 'PSY-251', title: 'General Psychology', credits: 3 },
      { courseId: 'FLS-161', title: 'Spanish I', credits: 3 },
      { courseId: 'MGT-220', title: 'Systems Approach to Business', credits: 3 },
      { courseId: 'MGT-203', title: 'Special Topics: Business Communications', credits: 3 },
    ]);
  });

  it('counts C or better on a letters-only scale', () => {
    expect(curriculum.grades).toEqual({ letters: ['A', 'B', 'C', 'D', 'F'], minimumCounting: 'C' });
  });

  it('has a history and a literature sequence that add no credits', () => {
    expect(curriculum.sequence.alternatives.map(alternative => alternative.courses)).toEqual([
      ['HIS-131', 'HIS-132'],
      ['ENG-209', 'ENG-210'],
    ]);
    expect(curriculum.sequence.additionalCredits).toBe(0);
  });

  it('has core blocks that total 42 hours', () => {
    const core = curriculum.blocks.filter(block => curriculum.sequence.coreBlocks.includes(block.id));
    expect(core.map(block => block.id)).toEqual(['orientation', 'composition', 'humanities', 'social-sciences', 'science-math']);
    expect(core.reduce((sum, block) => sum + block.credits, 0)).toBe(42);
    expect(curriculum.sequence.coreCredits).toBe(42);
  });

  it('completes each sequence with a pick inside a core block: HIS 132 in Social sciences, ENG 210 in Humanities', () => {
    const pickBlock = (courseId: string) =>
      curriculum.blocks.find(block => block.choices.some(choice => choice.courses.some(course => course.courseId === courseId)))?.id;
    expect(pickBlock('HIS-132')).toBe('social-sciences');
    expect(pickBlock('ENG-210')).toBe('humanities');
    const required = (blockId: string) => curriculum.blocks.find(block => block.id === blockId)?.required.map(course => course.courseId);
    expect(required('social-sciences')).toContain('HIS-131');
    expect(required('humanities')).toContain('ENG-209');
  });
});

describe('features.json', () => {
  const milestoneIds = featureList.milestones.map(milestone => milestone.id);

  it('has unique ids and the required fields on every entry', () => {
    const ids = featureList.features.map(feature => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const feature of featureList.features) {
      expect(feature.id).toMatch(/^F\d{2}$/);
      expect(feature.description.length, feature.id).toBeGreaterThan(0);
      expect(feature.steps.length, feature.id).toBeGreaterThan(0);
      expect(typeof feature.passes, feature.id).toBe('boolean');
      expect(typeof feature.evidence, feature.id).toBe('string');
      expect(Array.isArray(feature.tests), feature.id).toBe(true);
    }
  });

  it('is ordered by milestone M0 to M3', () => {
    expect(milestoneIds).toEqual(['M0', 'M1', 'M2', 'M3']);
    const order = featureList.features.map(feature => milestoneIds.indexOf(feature.milestone));
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('only passes a feature that names its tests and evidence', () => {
    for (const feature of featureList.features.filter(entry => entry.passes)) {
      expect(feature.tests.length, feature.id).toBeGreaterThan(0);
      expect(feature.evidence.length, feature.id).toBeGreaterThan(0);
    }
  });
});
