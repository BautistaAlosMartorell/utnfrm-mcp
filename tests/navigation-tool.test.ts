import { afterEach, describe, expect, it, vi } from 'vitest';
import { campusClient } from '../src/client/campus-client.js';
import { CAMPUS_ORIGIN } from '../src/config.js';
import { handleOpen } from '../src/tools/open.js';

afterEach(() => vi.restoreAllMocks());

describe('open navigation input', () => {
  it('applies a numeric section filter to a course URL', async () => {
    const getHtml = vi.spyOn(campusClient, 'getHtml').mockResolvedValue(
      '<div class="course-content"><h1>Curso</h1><ul class="topics"><li id="section-3"><h3 class="sectionname">Unidad</h3></li></ul></div>'
    );

    await handleOpen('101', '3');

    expect(getHtml).toHaveBeenCalledWith(CAMPUS_ORIGIN + '/course/view.php?id=101&section=3');
  });

  it('rejects an off-campus URL before using the authenticated client', async () => {
    const getHtml = vi.spyOn(campusClient, 'getHtml');
    await expect(handleOpen('https://evil.test/course/view.php?id=101')).rejects.toThrow();
    expect(getHtml).not.toHaveBeenCalled();
  });
});
