Erros
Service worker registration failed. Status code: 15
Uncaught SyntaxError: Unexpected token '<<'
Contexto
background/service-worker.js
Rastreamento de pilha
background/service-worker.js:119 (função anônima)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245
246
247
248
249
250
251
252
253
254
255
256
257
258
259
260
261
262
263
264
265
266
267
268
269
270
271
272
273
274
275
276
277
278
279
280
281
282
283
284
285
286
287
288
289
290
291
292
293
294
295
296
297
298
299
300
301
302
303
304
305
306
307
308
309
310
311
312
313
314
315
316
317
318
319
320
321
322
323
324
325
326
327
328
329
330
331
332
333
334
335
336
337
338
339
340
341
342
343
344
345
346
347
348
349
350
351
352
353
354
355
356
357
358
359
360
361
362
363
364
365
366
367
368
369
370
371
372
373
374
375
376
377
378
379
380
381
382
383
384
385
386
387
388
389
390
391
392
393
394
395
396
397
398
399
400
401
402
403
404
405
406
407
408
409
410
411
412
413
414
415
416
417
418
419
420
421
422
423
424
425
426
427
428
429
430
431
432
433
434
435
436
437
438
439
440
441
442
443
444
445
446
447
448
449
450
451
452
453
454
455
456
457
458
459
460
461
462
463
464
465
466
467
468
469
470
471
472
473
474
475
476
477
478
479
480
481
482
483
484
485
486
487
488
489
490
491
492
493
494
495
496
497
498
499
500
501
502
503
504
505
506
507
508
509
510
511
512
513
514
515
516
517
518
519
520
521
522
523
524
525
526
527
528
529
530
531
532
533
534
535
536
537
538
539
540
541
542
543
544
545
546
547
548
549
550
551
552
553
554
555
556
557
558
559
560
561
562
563
564
565
566
567
568
569
570
571
572
573
574
575
576
577
578
579
580
581
582
583
584
585
586
587
588
589
590
591
592
593
594
595
596
597
598
599
600
601
602
603
604
605
606
607
608
609
610
611
612
613
614
615
616
617
618
619
620
621
622
623
624
625
626
627
628
629
630
631
632
633
634
635
636
637
638
639
640
641
642
643
644
645
646
647
648
649
650
651
652
653
654
655
656
657
658
659
660
661
662
663
664
665
666
667
668
669
670
671
672
673
674
675
676
677
678
679
680
681
682
683
684
685
686
687
688
689
690
691
692
693
694
695
696
697
698
699
700
701
702
703
704
705
706
707
708
709
710
711
712
713
714
715
716
717
718
719
720
721
722
723
724
725
726
727
728
729
730
731
732
733
734
735
736
737
738
739
740
741
742
743
744
745
746
747
748
749
750
751
752
753
754
755
756
757
758
759
760
761
762
763
764
765
766
767
768
769
770
771
772
773
774
775
776
777
778
779
780
781
782
783
784
785
786
787
788
789
790
791
792
793
794
795
796
797
798
799
800
801
802
803
804
805
806
807
808
809
810
811
812
813
814
815
816
817
818
819
820
821
822
823
824
825
826
827
828
829
830
831
832
833
834
835
836
837
838
839
840
841
842
843
844
845
846
847
848
849
850
851
852
853
854
855
856
857
858
859
860
861
862
863
864
865
866
867
868
869
870
871
872
873
874
875
876
877
878
879
880
881
882
883
884
885
886
887
888
889
890
891
892
893
894
895
896
897
898
899
900
901
902
903
904
905
906
907
908
909
910
911
912
913
914
915
916
917
918
919
920
921
922
923
924
925
926
927
928
929
930
931
932
933
934
935
936
937
938
939
940
941
942
943
944
945
946
947
948
949
950
951
952
953
954
955
956
957
958
959
960
961
962
963
964
965
966
967
968
969
970
971
972
973
974
975
976
977
978
979
980
981
982
983
984
985
986
987
988
989
990
991
992
993
994
995
996
997
998
999
...
/**
 * service-worker.js
 * Background Service Worker — schedules the daily SSI routine and
 * orchestrates the sequence of content-script tasks.
 *
 * Execution windows (Brasília time, BRT = UTC-3):
 *   11:00 → US East Coast + Europe morning overlap
 *   21:00 → China / Australia morning + US West Coast late afternoon
 */

import { TARGET_WINDOWS } from '../utils/time-checker.js';
import { log } from '../utils/logger.js';

// How many sequential runs the user requested this session.
// Stored in chrome.storage.local so progress survives a SW restart.
// Keys: pendingRuns (countdown), totalRunsSession, currentRunNumber.

/**
 * 7-day diminishing connection schedule.
 * Day 0 = first run of the cycle (15 connections).
 * After day 6, the cycle resets to day 0.
 */
const DAILY_CAPS = [15, 14, 13, 12, 11, 10, 9];

// Maximum intro messages sent per run (stays well below LinkedIn DM rate limits)
const MESSAGE_CAP_PER_RUN = 20;

// Maximum number of sendMessage retries while waiting for the content script
const SEND_MAX_RETRIES = 15;  // 15 × 3 s = 45 s after page load
const SEND_FIRST_WAIT  = 3000; // first attempt: 3 s after status:complete
const SEND_RETRY_WAIT  = 3000; // subsequent attempts: every 3 s

// ─── Extension install / startup ────────────────────────────────────────────

// Posts the user specifically requested to comment on (seeded at install/update).
// Additional posts can be queued via the popup at any time.
const SEED_POST_URLS = [
  'https://www.linkedin.com/posts/samuel-gomes-costa-55503a340_backend-nodejs-nestjs-share-7456722421988044800-eWoS/',
  'https://www.linkedin.com/posts/tales-habib_recently-i-started-using-git-worktree-share-7457077215042863104-z_1X/',
  'https://www.linkedin.com/posts/gabriel-saturi_backend-distributedsystems-architecture-share-7457052634265407488-tLcm/',
];

chrome.runtime.onInstalled.addListener(async () => {
  log('Extension installed.', 'success');
  console.log('[SSI Optimizer] Installed.');
  await seedPostQueue();
});

/**
 * Adds SEED_POST_URLS to `specificPostQueue` if not already present.
 * Safe to call on every install/update — deduplicates by URL.
 */
async function seedPostQueue() {
  const { specificPostQueue = [] } = await chrome.storage.local.get('specificPostQueue');
  let added = 0;
  let reset = 0;
  for (const url of SEED_POST_URLS) {
    const existing = specificPostQueue.find(e => e.url === url);
    if (!existing) {
      specificPostQueue.push({ url, addedAt: new Date().toISOString(), done: false });
      added++;
    } else if (existing.done) {
      // Reset seed posts that were marked done without a confirmed content-script response
      // (i.e. before the success-based done logic was in place).
      existing.done = false;
      reset++;
    }
  }
  if (added > 0 || reset > 0) {
    await chrome.storage.local.set({ specificPostQueue });
    if (added > 0) await log(`[PostQueue] ${added} seed post(s) added to queue.`, 'success');
    if (reset > 0) await log(`[PostQueue] ${reset} seed post(s) reset to pending (will retry).`, 'info');
  }
}

chrome.runtime.onStartup.addListener(async () => {
  log('Extension started.');
});

// ─── Daily sequence orchestrator ─────────────────────────────────────────────

/**
 * Executes the full daily routine as an ordered task sequence.
 * SSI capture always runs first to log the baseline before any engagement.
 *
 * @param {string} targetWindow - TARGET_WINDOWS value
 * @param {number} dailyCap     - connection requests allowed today
 */
async function runDailySequence(targetWindow, dailyCap) {
  await chrome.storage.local.set({ routineRunning: true });
  try {
    await log('Step 1/6 — Capturing SSI scores…');
    await openTabAndWait('https://www.linkedin.com/sales/ssi', 'ssi-monitor', {});

    // Split the daily cap: Step 2 uses the keyword pool, Step 2c uses direct validated URLs.
    // Total connections per day stays within the DAILY_CAPS schedule.
    const capHalf = Math.floor(dailyCap / 2);
    const capRest = dailyCap - capHalf;

    await log(`Step 2/6 — Prospecting Tech Recruiters via keyword search (cap: ${capHalf})…`);
    await openTabAndWait(await buildSearchUrl(targetWindow), 'recruiter-prospector', { dailyCap: capHalf }, 600_000);

    await log('Step 2b/6 — Browsing people search (SSI: Localizar as pessoas certas)…');
    const peopleUrl = await getNextPeopleSearchUrl();
    await openTabAndWait(peopleUrl, 'recruiter-prospector', { dailyCap: 0 }, 600_000);
    await advancePeopleQueue();

    await log(`Step 2c/6 — Prospecting global profiles via direct URLs (cap: ${capRest})…`);
    const directUrl = await getNextDirectConnectUrl();
    await openTabAndWait(directUrl, 'recruiter-prospector', { dailyCap: capRest }, 600_000);
    await advanceDirectConnectQueue();

    await log('Step 3/6 — Engaging with targeted content search posts…');
    const { expr, index: exprIndex, url: postEngageUrl } = await getNextSearchExpression();
    await log(`Keyword ${exprIndex + 1}/${CONTENT_SEARCH_EXPRESSIONS.length}: "${expr}"`);
    await openTabAndWait(postEngageUrl, 'post-engager', {});
    await advanceExprQueue();

<<<<<<< HEAD
    await log('Step 3b/6 — Commenting on queued specific posts…');
    await processSpecificPostQueue();

    await log('Step 4/6 — Building relationships (birthdays + anniversaries + job changes)…');
=======
    await log('Step 3b/5 — Collecting job postings (PM / Delivery / Agile)…');
    const { keyword: jobKw, index: jobIdx } = await getNextJobKeyword();
    await log(`Job keyword ${jobIdx + 1}/${JOB_SEARCH_KEYWORDS.length}: "${jobKw}"`);
    await openTabAndWait(buildJobSearchUrl(jobKw), 'job-collector', { keyword: jobKw });
    await advanceJobQueue();

    await log('Step 3c/5 — Processing unprocessed jobs (recruiter + emails)…');
    const processedCount = await processUnprocessedJobs(5);
    await log(`Job-detail pass: ${processedCount} jobs processed.`);

    await log('Step 3d/5 — Visiting unprocessed lead profiles…');
    const leadsProcessed = await processUnprocessedLeads(5);
    await log(`Lead-profile pass: ${leadsProcessed} leads visited.`);

    await log('Step 4/5 — Building relationships (birthdays + anniversaries)…');
>>>>>>> d82b910 (feat: novos coletores (job, lead, detail) e refresh popup/manifest)
    await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/birthday/', 'relationship-builder', { pageType: 'birthday' });
    await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/work_anniversaries/', 'relationship-builder', { pageType: 'anniversary' });
    await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/job_changes/', 'relationship-builder', { pageType: 'new_job' });

    await log('Step 5/6 — Tracking accepted connections…');
    await openTabAndWait('https://www.linkedin.com/mynetwork/invitation-manager/sent/', 'connection-tracker', {});

    await log('Step 6/6 — Sending follow-up messages to accepted connections (≥24h)…');
    await openTabAndWait('https://www.linkedin.com/messaging/', 'follow-up-sender', {});
  } catch (err) {
    await chrome.storage.local.set({ routineRunning: false });
    await log(`Sequence error: ${err.message}`, 'error');
    return;
  }

  await chrome.storage.local.set({ routineRunning: false, lastSequenceDoneAt: new Date().toISOString() });
  await log(`Daily routine complete. Cap used: ${dailyCap}. Window: ${targetWindow}.`, 'success');

  // ─── Session summary (actual counts, not just caps) ──────────────────
  const _summary = await chrome.storage.local.get(['lastProspecting', 'lastEngagement', 'lastRelationshipBuild']);
  const _conns = _summary.lastProspecting?.sent ?? 0;
  const _posts = (_summary.lastEngagement?.likes ?? 0) + (_summary.lastEngagement?.comments ?? 0);
  const _rels  = _summary.lastRelationshipBuild?.touched ?? 0;
  await log(
    `[Summary] 🤝 Connections ${_conns} | 💬 Posts ${_posts} | 🎉 Relationships ${_rels}`,
    'success'
  );

  await log('Step 7/7 — Auto-messaging newly discovered profiles…');
  await buildAndRunAutoMessageQueue();

  // Note: iconUrl omitted — chrome.notifications fails to download extension icons in MV3 service workers
  chrome.notifications.create(`run-done-${Date.now()}`, {
    type: 'basic',
    title: 'SSI Optimizer',
    message: `Done. 🤝 ${_conns} connections | 💬 ${_posts} posts | 🎉 ${_rels} relationships`,
  });

  // Auto-open history page so the user can review results immediately
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
}

// ─── Specific-post queue ─────────────────────────────────────────────────────

/**
 * Reads `specificPostQueue` from storage, comments on each pending post once,
 * then removes successfully processed entries from the queue.
 *
 * Each queue entry: { url: string, addedAt: string, done?: boolean }
 */
async function processSpecificPostQueue() {
  const { specificPostQueue = [] } = await chrome.storage.local.get('specificPostQueue');
  const pending = specificPostQueue.filter(e => !e.done);

  if (!pending.length) {
    await log('[PostQueue] No pending posts in queue — skipping.', 'info');
    return;
  }

  await log(`[PostQueue] Processing ${pending.length} queued post(s)…`);

  for (const entry of pending) {
    await log(`[PostQueue] Commenting on: ${entry.url}`);
    try {
      const responded = await openTabAndWait(entry.url, 'post-engager', { singlePost: true, commentTemplate: null });
      if (responded) {
        entry.done = true;
        await log(`[PostQueue] Done: ${entry.url}`, 'success');
      } else {
        await log(`[PostQueue] Skipped (no content script response) — will retry next run: ${entry.url}`, 'warn');
      }
    } catch (err) {
      await log(`[PostQueue] Error on ${entry.url}: ${err.message}`, 'error');
    }
  }

  // Persist the updated queue (mark done=true; fully remove entries older than 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const updated = specificPostQueue.filter(
    e => !e.done || new Date(e.addedAt).getTime() > sevenDaysAgo
  );
  await chrome.storage.local.set({ specificPostQueue: updated });
  await log(`[PostQueue] Queue flushed. ${pending.length} post(s) processed.`, 'success');
}

/**
 * Opens a LinkedIn URL in a new tab, waits for the content script to register
 * its message listener, sends START, then waits for the task to complete.
 *
 * Because LinkedIn is a heavy SPA, `status: 'complete'` fires long before the
 * page's own JS — and therefore the content script module — is ready.
 * We poll with sendMessage every 3 s until the content script responds or
 * the 90-second safety timer fires.
 *
 * @param {string} url
 * @param {string} task
 * @param {object} payload
 */
function openTabAndWait(url, task, payload = {}, timeoutMs = 90_000) {
  return new Promise((resolve) => {
    let settled = false;
    let createdTabId = null;
    let contentScriptResponded = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      if (createdTabId !== null) {
        chrome.tabs.remove(createdTabId, () => {
          if (chrome.runtime.lastError) {} // tab may already be closed
          resolve(contentScriptResponded);
        });
      } else {
        resolve(contentScriptResponded);
      }
    };

    const settleSuccess = () => {
      contentScriptResponded = true;
      settle();
    };

    const timeoutSecs = Math.round(timeoutMs / 1000);
    const safetyTimer = setTimeout(() => {
      log(`[${task}] timed out after ${timeoutSecs} s — continuing sequence`, 'warn');
      settle();
    }, timeoutMs);

    chrome.tabs.create({ url, active: false }, (tab) => {
      createdTabId = tab.id;
      if (settled) {
        chrome.tabs.remove(tab.id, () => {});
        return;
      }

      const loadListener = (tabId, changeInfo) => {
        if (tabId !== createdTabId || changeInfo.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(loadListener);
        trySendStart(createdTabId, task, payload, 0, settle, settleSuccess);
      };
      chrome.tabs.onUpdated.addListener(loadListener);
    });
  });
}

/**
 * Polls sendMessage every SEND_RETRY_WAIT ms until the content script
 * responds (meaning its onMessage listener is registered and the task ran),
 * or until MAX_RETRIES is exhausted.
 */
function trySendStart(tabId, task, payload, attempt, done, doneSuccess) {
  if (attempt > SEND_MAX_RETRIES) {
    log(`[${task}] content script did not respond after ${SEND_MAX_RETRIES} retries — skipping`, 'warn');
    done();
    return;
  }

  const wait = attempt === 0 ? SEND_FIRST_WAIT : SEND_RETRY_WAIT;
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, { action: 'START', task, ...payload }, (_resp) => {
      if (chrome.runtime.lastError) {
        // Content script not ready yet — try again
        trySendStart(tabId, task, payload, attempt + 1, done, doneSuccess);
        return;
      }
      // Content script received START and called sendResponse — task complete
      if (doneSuccess) doneSuccess(); else done();
    });
  }, wait);
}

/**
 * Targeted content-search expressions for Wesley's profile:
 * Project Manager / Delivery Manager / Agile lead, working globally from Brazil.
 *
 * Format: phrase that appears in posts written BY or FOR recruiters/leaders
 * in the target market. Each run picks one at random so LinkedIn doesn't flag
 * repetitive automated searches.
 *
 * Industries targeted (LinkedIn f_I codes):
 *   96  → Technology, Information and Internet
 *   6   → Technology, Information and Media
 *   4   → IT Services and IT Consulting
 *   69  → Technical and Vocational Training
 *   32  → Utilities / Energy Technology
 */
// Validated content-search keywords — matches proven LinkedIn search URL format
// (authorIndustry=6 = Technology, Information and Media — user-validated sector)
const CONTENT_SEARCH_EXPRESSIONS = [
  'project delivery',
  'project delivery latam',
  'agile master',
  'project manager brazil',
  'project delivery brazil',
  'tech recruiter information technology',
  'delivery manager',
  'delivery manager latam',
  'project manager latam',
  'IT manager remote',
  'nearshore project manager',
  'tech lead latam',
  'engineering manager brazil',
  'program manager latam',
  'product delivery latam',
  'agile delivery brazil',
  'scrum master latam',
  'remote project manager jobs',
  'remote project manager jobs latam',
  'project manager',
  'agile manager',
  'manager project',
  'tech recruiter experian',
  'tech recruiter information technology experian',
  // LATAM hiring post-engagement — used by round-robin AND the dedicated engage-hiring-latam scenario
  'hiring agile latam',
  'hiring scrum latam',
  'hiring delivery latam',
];

// People-search URLs for "Localizar as pessoas certas" SSI pillar — view-only browse
// Rotated each run so LinkedIn sees varied, organic search behaviour
const PEOPLE_SEARCH_URLS = [
  'https://www.linkedin.com/search/results/people/?keywords=IT%20Manager%20remote%20brazil&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=Delivery%20Manager%20LATAM&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=Project%20Manager%20Brazil%20remote&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=tech%20recruiter%20information%20technology&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=Engineering%20Manager%20LATAM&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=IT%20recruitment%20technology%20brazil&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=nearshore%20IT%20manager%20LATAM&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=startup%20project%20manager%20remote&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=startup%20delivery%20manager%20LATAM&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  // Tech Recruiter IT — US + Canada + UK + Australia + Germany + Netherlands + Ireland + Brazil — 1st/2nd degree
  'https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101165590%22%2C%22100364837%22%2C%22102454443%22%2C%22102890883%22%2C%22104738515%22%2C%22101174742%22%5D',
  // Tech Recruiter IT — same geos, English-only profiles, staffing/recruiting service category
  'https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101174742%22%2C%22101165590%22%2C%22100364837%22%2C%22102454443%22%2C%22102890883%22%2C%22104738515%22%5D&serviceCategory=%5B%224725%22%5D&profileLanguage=%5B%22en%22%5D',
  // Tech Recruiter IT — US/CA/AU/UK/Singapore, staffing category, English, IT industry
  'https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101174742%22%2C%22101165590%22%2C%22104738515%22%5D&serviceCategory=%5B%224725%22%5D&profileLanguage=%5B%22en%22%5D',
  // Tech Recruiter IT — US/CA/UK/AU/Singapore, IT consulting service category, English
  'https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101165590%22%2C%22101174742%22%2C%22104738515%22%5D&serviceCategory=%5B%2250342%22%5D&profileLanguage=%5B%22en%22%5D',
  // tech recruiter experian — US, Canada, Australia, Netherlands, Germany, France (user-validated geos)
  'https://www.linkedin.com/search/results/people/?keywords=tech%20recruiter%20experian&origin=FACETED_SEARCH&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%5D&network=%5B%22S%22%2C%22O%22%5D',
  // tech recruiter experian — same geos, with Tech/IT industry filter
  'https://www.linkedin.com/search/results/people/?keywords=tech%20recruiter%20experian&origin=FACETED_SEARCH&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%5D&network=%5B%22S%22%2C%22O%22%5D&f_I=%5B%226%22%5D',
  // ── Persona 2: Director / Head of Talent Acquisition ──────────────────────
  // TA leaders who decide WHERE to source — US, UK, Canada, Germany, Netherlands
  'https://www.linkedin.com/search/results/people/?keywords=Head%20of%20Talent%20Acquisition%20technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%5D&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  // TA Director with nearshore or LATAM scope — US, UK, Canada, Australia, France
  'https://www.linkedin.com/search/results/people/?keywords=Director%20Talent%20Acquisition%20nearshore%20LATAM&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22101739942%22%2C%22102454443%22%5D',
  // ── Persona 3: VP Engineering / CTO / Head of Engineering ─────────────────
  // Decision-makers at US tech companies that hire nearshore delivery managers
  'https://www.linkedin.com/search/results/people/?keywords=VP%20Engineering%20nearshore%20remote&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%5D&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  // CTO at startup / scale-up — US, UK, Canada, Germany, Netherlands (Series A-C)
  'https://www.linkedin.com/search/results/people/?keywords=CTO%20startup%20remote%20LATAM&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%5D&f_I=%5B%2296%22%2C%226%22%5D',
  // Head of Engineering at companies with LATAM remote teams
  'https://www.linkedin.com/search/results/people/?keywords=Head%20of%20Engineering%20LATAM%20remote&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22101739942%22%2C%22102454443%22%5D',
  // ── Persona 4: Nearshore / Staff Augmentation Account Executive ───────────
  // AEs who sell nearshore squads and need PMs — US, UK, Canada
  'https://www.linkedin.com/search/results/people/?keywords=Account%20Executive%20nearshore%20staff%20augmentation&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%5D&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  // Business Development at companies like Globant, CI&T, Encora, Softtek, Stefanini
  'https://www.linkedin.com/search/results/people/?keywords=Business%20Development%20nearshore%20IT%20LATAM&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%5D',
  // Delivery/Engagement Manager at nearshore vendors — peers who can refer
  'https://www.linkedin.com/search/results/people/?keywords=Engagement%20Manager%20nearshore%20software&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%5D',
];

// Job search URLs targeting LATAM hiring managers who post "Meet the hiring team".
// Harvested via content/job-recruiter-harvester.js (on-demand, popup button).
const JOB_HARVEST_URLS = [
  // "projet manager latam" — starts from page 1 (has >5 pages, harvester will follow all)
  'https://www.linkedin.com/jobs/search/?currentJobId=4405110262&distance=100&geoId=105458072&keywords=projet%20manager%20latam&origin=JOB_SEARCH_PAGE_JOB_FILTER&refresh=true',
  // "delivery manager" +latam
  'https://www.linkedin.com/jobs/search/?currentJobId=4409975921&f_T=77&geoId=105056705&keywords=%22delivery%20manager%22%20%2Blatam&origin=JOB_SEARCH_PAGE_LOCATION_AUTOCOMPLETE&refresh=true&sortBy=R',
  // "project manager" +latam
  'https://www.linkedin.com/jobs/search/?currentJobId=4408667708&f_T=77&geoId=105056705&keywords=%22project%20manager%22%20%2Blatam&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&refresh=true&sortBy=R',
];

// LinkedIn content-search pages for LATAM hiring post engagement.
// Converted to /feed/hashtag/ format — /search/results/content/ uses obfuscated CSS
// that prevents reliable element selection in LinkedIn 2026.
const LATAM_HIRING_ENGAGE_URLS = [
  'https://www.linkedin.com/feed/hashtag/hiring-agile-latam/',
  'https://www.linkedin.com/feed/hashtag/hiring-scrum-latam/',
  'https://www.linkedin.com/feed/hashtag/hiring-delivery-latam/',
];

// Content-search pages for decision-maker post engagement (Persona 3 & 4).
// Target: CTO / Head of Engineering / VP Engineering / Account Executive in IT industry.
// post-engager.js strategy s0/s0b/s0c handles /search/results/content/ pages;
// author names + profile URLs are saved to discoveredAuthors via saveAuthorContact().
const EXEC_ENGAGE_URLS = [
  // CTO startup — posts by IT-industry CTOs (SSI Insights: engage with decision-makers)
  'https://www.linkedin.com/search/results/content/?keywords=CTO%20startup&origin=FACETED_SEARCH&authorIndustry=%5B%226%22%5D',
  // Head of Engineering — engineering leaders in IT (signal: you follow engineering discourse)
  'https://www.linkedin.com/search/results/content/?keywords=Head%20of%20Engineering&origin=GLOBAL_SEARCH_HEADER&authorIndustry=%5B%226%22%5D',
  // VP Engineering — VP-level engineering leaders in IT
  'https://www.linkedin.com/search/results/content/?keywords=VP%20Engineering&origin=GLOBAL_SEARCH_HEADER&authorIndustry=%5B%226%22%5D',
  // Account Executive IT — nearshore/staffing AEs who broker PM placements
  'https://www.linkedin.com/search/results/content/?keywords=Account%20Executive&origin=GLOBAL_SEARCH_HEADER&authorIndustry=%5B%226%22%5D',
];

/**
 * Available automation scenarios.
 * Served to the popup via GET_SCENARIOS; user selections stored as `selectedScenarios`.
 * Each id maps to a case in runScenario().
 */
const SCENARIOS = [
  { id: 'full-pipeline',       label: '🔁 Full Pipeline',         description: 'SSI · Prospect · Engage · Relationships · Track · Follow-up + Messages' },
  { id: 'ssi-capture',         label: '📊 Capture SSI',           description: 'Read and store current SSI pillar scores (baseline before any action)' },
  { id: 'prospect-connect',    label: '🤝 Prospect & Connect',    description: 'Find and send connection requests to tech recruiters via people search + direct URLs' },
  { id: 'engage-insights',     label: '💬 Engage with Posts',     description: 'Like/comment on the next keyword in the round-robin rotation (SSI: Insights)' },
  { id: 'engage-hiring-latam', label: '🎯 Engage: Hiring LATAM', description: 'Comment on all 3 hiring/agile/scrum/delivery LATAM hashtag feeds (SSI: Insights)' },
  { id: 'engage-exec-posts',   label: '🏢 Engage: Exec Posts',    description: 'Comment on posts by CTO/VP Eng/Head of Eng/Account Exec — logs author names + links' },
  { id: 'build-relationships', label: '🔔 Build Relationships',   description: 'Birthday/anniversary congrats + connection tracking + follow-up messages (SSI: Relationships)' },
  { id: 'job-harvest',         label: '🔍 Job Recruiter Harvest', description: 'Scrape LinkedIn jobs → connect + follow + message new recruiters' },
];

// Direct people-search URLs for global (non-Brazilian) profiles — network=O (3rd degree+)
// These are user-validated URLs that target genuinely global audiences.
// Rotated each run, processed with full connect cap (split with Step 2).
const RECRUITER_DIRECT_CONNECT_URLS = [
  // VP Engineering remote LATAM — 3rd degree — US, UK, Canada (direct hiring authority)
  'https://www.linkedin.com/search/results/people/?keywords=VP%20Engineering%20remote%20LATAM&origin=FACETED_SEARCH&network=%5B%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%5D&f_I=%5B%2296%22%2C%226%22%5D',
  // 3rd degree, "europe" keyword — France, Netherlands, US, Portugal, UK, Germany
  'https://www.linkedin.com/search/results/people/?keywords=europe&origin=FACETED_SEARCH&network=%5B%22O%22%5D&geoUrn=%5B%22101165590%22%2C%22105015875%22%2C%22103644278%22%2C%22106204383%22%2C%22101174742%22%2C%22104738515%22%5D',
  // "hiring project manager" — 1st+2nd+3rd degree — US, UK, Canada, Germany, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20project%20manager&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101174742%22%2C%22101165590%22%2C%22102454443%22%2C%22104738515%22%2C%22105015875%22%2C%22106204383%22%5D',
  // "hiring delivery manager" — 1st+2nd+3rd degree — US, France, UK, Canada, Germany, Netherlands
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20delivery%20manager&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22105015875%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%2C%22106204383%22%5D',
  // "hiring delivery manager latam" — 1st+2nd+3rd degree — US, UK, Canada, Germany, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20delivery%20manager%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%2C%22105015875%22%2C%22106204383%22%5D',
  // "hiring project manager latam" — 1st+2nd+3rd degree — US, UK, Canada, Germany, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20project%20manager%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%2C%22105015875%22%2C%22106204383%22%5D',
  // "hiring scrum latam" — 1st+2nd+3rd degree — UK, Canada, Germany, US, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20scrum%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22103644278%22%2C%22104738515%22%2C%22105015875%22%2C%22106204383%22%5D',
  // "hiring agile latam" — 1st+2nd+3rd degree — US, Canada, UK, Germany, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20agile%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101174742%22%2C%22106204383%22%2C%22101165590%22%2C%22102454443%22%2C%22104738515%22%2C%22105015875%22%5D',
  // "hiring startup project manager" — US, UK, Canada, Netherlands, Germany, Portugal, UAE
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20startup%20project%20manager&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22104738515%22%2C%22102890883%22%2C%22105015875%22%2C%22106157047%22%5D',
  // "startup delivery manager remote latam" — US, UK, Canada, Netherlands, Germany, Portugal, UAE
  'https://www.linkedin.com/search/results/people/?keywords=startup%20delivery%20manager%20remote%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22104738515%22%2C%22102890883%22%2C%22105015875%22%2C%22106157047%22%5D',
];

// Job search keywords — PM / Delivery / Agile target roles, past week, remote-friendly
const JOB_SEARCH_KEYWORDS = [
  'Project Manager',
  'Project Delivery Manager',
  'Delivery Manager',
  'Program Manager',
  'Agile Master',
  'Agile Coach',
  'Scrum Master',
  'Engineering Manager',
  'IT Project Manager',
];

/**
 * Returns the next content-search expression using round-robin rotation.
 * Cycles through all 27 expressions before any repeats.
 * Stores `exprQueueIndex` (0–26) in chrome.storage.local.
 */
async function getNextSearchExpression() {
  const { exprQueueIndex = 0 } = await chrome.storage.local.get('exprQueueIndex');
  const idx  = exprQueueIndex % CONTENT_SEARCH_EXPRESSIONS.length;
  const expr = CONTENT_SEARCH_EXPRESSIONS[idx];

  // LinkedIn 2026: /search/results/content/ renders posts with fully obfuscated CSS classes —
  // all 11+ DOM selectors return 0. Switch to /feed/hashtag/ which uses the standard feed
  // layout and retains [data-occludable-entity-urn] and aria-label="Like" attributes.
  // Hashtag URLs have the same content-filtering benefit as content-search keywords.
  const hashtag = expr.trim().toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.linkedin.com/feed/hashtag/${encodeURIComponent(hashtag)}/`;

  await chrome.storage.local.set({ lastUsedExpression: { expr, index: idx, usedAt: new Date().toISOString() } });
  return { expr, index: idx, url };
}

async function advanceExprQueue() {
  const { exprQueueIndex = 0 } = await chrome.storage.local.get('exprQueueIndex');
  const next = (exprQueueIndex + 1) % CONTENT_SEARCH_EXPRESSIONS.length;
  await chrome.storage.local.set({ exprQueueIndex: next });
  console.log(`[SSI Optimizer] Expr queue advanced: ${exprQueueIndex} → ${next} (next: "${CONTENT_SEARCH_EXPRESSIONS[next]}")`);
}

async function getNextPeopleSearchUrl() {
  const { peopleQueueIndex = 0 } = await chrome.storage.local.get('peopleQueueIndex');
  const idx = peopleQueueIndex % PEOPLE_SEARCH_URLS.length;
  console.log(`[SSI Optimizer] People search URL ${idx + 1}/${PEOPLE_SEARCH_URLS.length}: ${PEOPLE_SEARCH_URLS[idx]}`);
  return PEOPLE_SEARCH_URLS[idx];
}

async function advancePeopleQueue() {
  const { peopleQueueIndex = 0 } = await chrome.storage.local.get('peopleQueueIndex');
  const next = (peopleQueueIndex + 1) % PEOPLE_SEARCH_URLS.length;
  await chrome.storage.local.set({ peopleQueueIndex: next });
  console.log(`[SSI Optimizer] People queue advanced: ${peopleQueueIndex} → ${next}`);
}

<<<<<<< HEAD
async function getNextDirectConnectUrl() {
  const { directConnectIndex = 0 } = await chrome.storage.local.get('directConnectIndex');
  const idx = directConnectIndex % RECRUITER_DIRECT_CONNECT_URLS.length;
  console.log(`[SSI Optimizer] Direct connect URL ${idx + 1}/${RECRUITER_DIRECT_CONNECT_URLS.length}: ${RECRUITER_DIRECT_CONNECT_URLS[idx]}`);
  return RECRUITER_DIRECT_CONNECT_URLS[idx];
}

async function advanceDirectConnectQueue() {
  const { directConnectIndex = 0 } = await chrome.storage.local.get('directConnectIndex');
  const next = (directConnectIndex + 1) % RECRUITER_DIRECT_CONNECT_URLS.length;
  await chrome.storage.local.set({ directConnectIndex: next });
  console.log(`[SSI Optimizer] Direct connect queue advanced: ${directConnectIndex} → ${next}`);
=======
async function getNextJobKeyword() {
  const { jobQueueIndex = 0 } = await chrome.storage.local.get('jobQueueIndex');
  const idx = jobQueueIndex % JOB_SEARCH_KEYWORDS.length;
  return { keyword: JOB_SEARCH_KEYWORDS[idx], index: idx };
}

async function advanceJobQueue() {
  const { jobQueueIndex = 0 } = await chrome.storage.local.get('jobQueueIndex');
  const next = (jobQueueIndex + 1) % JOB_SEARCH_KEYWORDS.length;
  await chrome.storage.local.set({ jobQueueIndex: next });
  console.log(`[SSI Optimizer] Job queue advanced: ${jobQueueIndex} → ${next} (next: "${JOB_SEARCH_KEYWORDS[next]}")`);
}

function buildJobSearchUrl(keyword) {
  // f_TPR=r604800 = past week; f_WT=2 includes remote
  const kw = encodeURIComponent(keyword);
  return (
    `https://www.linkedin.com/jobs/search/?keywords=${kw}` +
    `&f_TPR=r604800` +
    `&sortBy=DD`
  );
}

/**
 * Cyclic processor: opens up to `cap` jobs that have not been detail-extracted
 * yet, lets job-detail-extractor.js scrape recruiter + emails + description,
 * and marks them processed=true so the next cycle skips them.
 * Service-worker imports of db.js are not available here, so we read storage
 * directly using the same `jobs` array shape that utils/db.js writes.
 */
async function processUnprocessedJobs(cap = 5) {
  const { jobs = [] } = await chrome.storage.local.get('jobs');
  const pending = jobs
    .filter(j => !j.processed && j.url)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(0, cap);

  if (pending.length === 0) {
    await log('[job-detail] no unprocessed jobs in queue.');
    return 0;
  }

  await log(`[job-detail] opening ${pending.length} job(s) in sequence…`);
  let done = 0;
  for (const job of pending) {
    try {
      await openTabAndWait(job.url, 'job-detail', { jobId: job.jobId });
      done++;
      // small spacer between detail pages (human-like)
      await randomWait(4000, 9000);
    } catch (e) {
      await log(`[job-detail] error on ${job.jobId}: ${e.message}`, 'error');
    }
  }
  return done;
}

/**
 * Cyclic processor for leads: opens up to `cap` LinkedIn profiles found in
 * the leads store but not yet visited (processed=false), letting
 * lead-extractor.js re-scan them and flipping processed=true via
 * markLeadProcessed.
 */
async function processUnprocessedLeads(cap = 5) {
  const { leads = [] } = await chrome.storage.local.get('leads');
  const pending = leads
    .filter(l => !l.processed && /linkedin\.com\/in\//.test(l.sourceUrl || ''))
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(0, cap);

  if (pending.length === 0) {
    await log('[lead-process] no unprocessed leads in queue.');
    return 0;
  }

  await log(`[lead-process] opening ${pending.length} profile(s) in sequence…`);
  let done = 0;
  for (const lead of pending) {
    try {
      const url = lead.sourceUrl.split('?')[0];
      await openTabAndWait(url, 'lead-extractor', { markSourceUrl: url });
      done++;
      await randomWait(5000, 11000);
    } catch (e) {
      await log(`[lead-process] error on ${lead.sourceUrl}: ${e.message}`, 'error');
    }
  }
  return done;
}

/**
 * Opens the top-N unprocessed jobs in visible foreground tabs for human review.
 * Does not call any content script — purely a convenience launcher.
 */
async function openTopJobs(cap = 5) {
  const { jobs = [] } = await chrome.storage.local.get('jobs');
  const pending = jobs
    .filter(j => !j.processed && j.url)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(0, cap);
  for (const job of pending) {
    chrome.tabs.create({ url: job.url, active: false });
  }
  return pending.length;
>>>>>>> d82b910 (feat: novos coletores (job, lead, detail) e refresh popup/manifest)
}

function buildPostEngageUrl() {
  const expr = CONTENT_SEARCH_EXPRESSIONS[
    Math.floor(Math.random() * CONTENT_SEARCH_EXPRESSIONS.length)
  ];
  const hashtag = expr.trim().toLowerCase().replace(/\s+/g, '-');
  return `https://www.linkedin.com/feed/hashtag/${encodeURIComponent(hashtag)}/`;
}

/**
 * Pool of recruiter-search keywords per target window.
 * Rotated each run via chrome.storage.local so LinkedIn sees organic,
 * varied search behaviour — and we reach LATAM-focused hiring managers
 * who use different terminology.
 */
const RECRUITER_SEARCH_POOL = {
  US_EU: [
    'Tech Recruiter Information Technology',
    'IT Recruiter LATAM nearshore',
    'Technical Recruiter remote latin america',
    'Talent Acquisition IT remote LATAM',
    'Engineering Recruiter nearshore Brazil',
    'IT Staffing remote latin america',
    'Head of Talent technology nearshore',
    'Software Engineer Recruiter LATAM',
    'Remote IT Recruiter south america',
    'Talent Acquisition Manager nearshore',
    'Technical Recruiter offshore brazil',
    'IT Recruiter nearshore remote',
    'Recruiter Information Technology remote',
    'Staff Augmentation Recruiter LATAM',
    'Offshore IT Recruiter latin america',
    // Startup / scale-up / VC-backed segment (mirrors portfolio SEO keywords)
    'Startup Recruiter project manager remote',
    'VC startup IT Recruiter LATAM',
    'Tech Recruiter startup nearshore',
    'Scale-up Recruiter engineering LATAM',
    'Talent Acquisition startup project manager',
    'Recruiter Series A Series B LATAM remote',
  ],
  APAC: [
    'Tech Recruiter Information Technology',
    'IT Recruiter remote APAC',
    'Technical Recruiter nearshore',
    'Talent Acquisition IT remote',
    'Engineering Recruiter APAC nearshore',
    'Head of Talent technology APAC',
    'Remote IT Recruiter australia',
    'Staff Augmentation Recruiter APAC',
  ],
};

async function buildSearchUrl(targetWindow) {
  const counterKey = `recruiterCounter_${targetWindow}`;
  const stored = await chrome.storage.local.get(counterKey);
  const counter = stored[counterKey] || 0;

  const pool = RECRUITER_SEARCH_POOL[targetWindow] || RECRUITER_SEARCH_POOL.US_EU;
  // Each keyword spans 10 pages before rotating to the next
  const keywordIdx = Math.floor(counter / 10) % pool.length;
  const page       = (counter % 10) + 1;          // 1 – 10
  const keyword    = pool[keywordIdx];
  const keywords   = encodeURIComponent(keyword);

  await chrome.storage.local.set({ [counterKey]: counter + 1 });
  console.log(
    `[SSI Optimizer] Recruiter search "${keyword}" page ${page}/10` +
    ` (keyword ${keywordIdx + 1}/${pool.length}) | window: ${targetWindow}`
  );

  // Expanded geo list validated by the user across pages 1-10
  const geoMap = {
    // USA, UK, Canada, Australia, Netherlands, Germany, France, Portugal, UAE
    US_EU: '%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%2C%22105015875%22%2C%22106157047%22%5D',
    APAC:  '%5B%22102257491%22%2C%22101452733%22%5D',   // Australia + Singapore
  };
  const geo      = geoMap[targetWindow] || geoMap.US_EU;
  const pagePart = page > 1 ? `&page=${page}` : '';
  return (
    `https://www.linkedin.com/search/results/people/?keywords=${keywords}` +
    `&network=%5B%22S%22%2C%22O%22%5D` +
    `&geoUrn=${geo}` +
    `&spellCorrectionEnabled=true` +
    `&prioritizeMessage=false` +
    pagePart
  );
}

// ─── Day cycle management ────────────────────────────────────────────────────

/**
 * Returns the connection cap for today based on the current position
 * in the 7-day diminishing schedule: 15, 14, 13, 12, 11, 10, 9.
 */
async function getDailyConnectionCap() {
  const { dayCycleIndex = 0 } = await chrome.storage.local.get('dayCycleIndex');
  return DAILY_CAPS[dayCycleIndex % DAILY_CAPS.length];
}

/**
 * Advances the day cycle index by 1 (mod 7).
 * Called after each successful daily routine completion.
 */
async function advanceDayCycle() {
  const { dayCycleIndex = 0 } = await chrome.storage.local.get('dayCycleIndex');
  const next = (dayCycleIndex + 1) % DAILY_CAPS.length;
  await chrome.storage.local.set({ dayCycleIndex: next });
  console.log(
    `[SSI Optimizer] Day cycle advanced: ${dayCycleIndex} → ${next} ` +
    `(next cap: ${DAILY_CAPS[next]} connections)`
  );
}

function randomWait(minMs, maxMs) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ─── Run counter ──────────────────────────────────────────────────────────────

/**
 * Runs the full daily sequence N times (1–10), advancing the day cycle after each.
 * Between runs, waits 5–10 minutes to respect LinkedIn rate limits.
 * Tracks progress in storage so the popup can display "Run K/N".
 *
 * Storage keys used: pendingRuns (countdown), totalRunsSession, currentRunNumber
 */
async function runNTimes(n) {
  const safeN = Math.max(1, Math.min(10, n));
  await chrome.storage.local.set({ pendingRuns: safeN, totalRunsSession: safeN, currentRunNumber: 0 });

  for (let i = 0; i < safeN; i++) {
    await chrome.storage.local.set({ currentRunNumber: i + 1 });
    const cap = await getDailyConnectionCap();
    await log(`[Run ${i + 1}/${safeN}] Starting. Connection cap: ${cap}.`, 'warn');
    await runDailySequence(TARGET_WINDOWS.US_EU, cap);
    await advanceDayCycle();

    const remaining = safeN - i - 1;
    await chrome.storage.local.set({ pendingRuns: remaining });

    if (remaining > 0) {
      const waitMs = (5 + Math.floor(Math.random() * 6)) * 60 * 1000; // 5–10 min
      await log(`[Run ${i + 1}/${safeN}] Done. Waiting ${Math.round(waitMs / 60000)} min before run ${i + 2}…`, 'info');
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  await chrome.storage.local.set({ pendingRuns: 0 });
  await log(`[RunCounter] All ${safeN} run(s) complete.`, 'success');
}

// ─── Scenario runner ──────────────────────────────────────────────────────────

/**
 * Compares a batch of profile IDs against the all-time set stored in
 * `allTimeProfiles`. Logs new/returning/duplicate stats and persists the
 * updated set.
 *
 * @param {string[]} profileIds
 * @param {string}   label      — prefix shown in the log line (e.g. 'JobHarvest')
 */
async function computeProfileStats(profileIds, label) {
  const { allTimeProfiles = [] } = await chrome.storage.local.get('allTimeProfiles');
  const allTimeSet = new Set(allTimeProfiles);

  const batchSet  = new Set();
  let duplicates  = 0;
  let newCount    = 0;
  let returning   = 0;

  for (const pid of profileIds) {
    if (batchSet.has(pid)) { duplicates++; continue; }
    batchSet.add(pid);
    if (allTimeSet.has(pid)) { returning++; } else { newCount++; allTimeSet.add(pid); }
  }

  const total  = batchSet.size;
  const newPct = total > 0 ? Math.round((newCount / total) * 100) : 0;
  await log(
    `[${label}] ${newCount} new (${newPct}%), ${returning} returning, ${duplicates} duplicates in batch`,
    'info'
  );

  await chrome.storage.local.set({ allTimeProfiles: [...allTimeSet] });
}

/**
 * Likes/comments on posts in all 3 LATAM hiring hashtag feeds.
 * Used exclusively by the 'engage-hiring-latam' scenario.
 */
async function engageHiringLatam() {
  for (let i = 0; i < LATAM_HIRING_ENGAGE_URLS.length; i++) {
    const url = LATAM_HIRING_ENGAGE_URLS[i];
    await log(`[EngageHiringLatam] ${i + 1}/${LATAM_HIRING_ENGAGE_URLS.length}: ${url}`, 'info');
    await openTabAndWait(url, 'post-engager', {}, 90_000);
    if (i < LATAM_HIRING_ENGAGE_URLS.length - 1) await randomWait(5000, 10000);
  }
}

/**
 * Likes/comments on posts from decision-maker content searches
 * (CTO / Head of Engineering / VP Engineering / Account Executive — IT industry).
 * post-engager.js saves every post author name + profile URL to discoveredAuthors.
 * Used exclusively by the 'engage-exec-posts' scenario.
 */
async function engageExecPosts() {
  for (let i = 0; i < EXEC_ENGAGE_URLS.length; i++) {
    const url = EXEC_ENGAGE_URLS[i];
    await log(`[EngageExecPosts] ${i + 1}/${EXEC_ENGAGE_URLS.length}: ${url}`, 'info');
    await openTabAndWait(url, 'post-engager', {}, 90_000);
    if (i < EXEC_ENGAGE_URLS.length - 1) await randomWait(5000, 10000);
  }
}

/**
 * Dispatches a single scenario by id, using the provided connection cap.
 *
 * @param {string} scenarioId — must match one of the ids in SCENARIOS
 * @param {number} dailyCap
 */
async function runScenario(scenarioId, dailyCap) {
  await log(`[Scenario] Running: ${scenarioId} (cap ${dailyCap})`, 'warn');
  switch (scenarioId) {
    case 'full-pipeline':
      await runDailySequence(TARGET_WINDOWS.US_EU, dailyCap);
      break;
    case 'ssi-capture': {
      const ssiUrl = 'https://www.linkedin.com/sales/ssi';
      await openTabAndWait(ssiUrl, 'ssi-monitor', {}, 60_000);
      break;
    }
    case 'prospect-connect': {
      const searchUrl = await buildSearchUrl(TARGET_WINDOWS.US_EU);
      await openTabAndWait(searchUrl, 'recruiter-prospector', { dailyCap }, 90_000);
      await advancePeopleQueue();
      break;
    }
    case 'engage-insights': {
      const { expr, url } = await getNextSearchExpression();
      await log(`[Scenario] Engaging hashtag: ${expr}`, 'info');
      await openTabAndWait(url, 'post-engager', {}, 90_000);
      await advanceExprQueue();
      break;
    }
    case 'engage-hiring-latam':
      await engageHiringLatam();
      break;
    case 'engage-exec-posts':
      await engageExecPosts();
      break;
    case 'build-relationships':
      await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/birthday/', 'relationship-builder', {}, 90_000);
      await openTabAndWait('https://www.linkedin.com/mynetwork/invitation-manager/sent/', 'connection-tracker', {}, 60_000);
      await openTabAndWait('https://www.linkedin.com/messaging/', 'follow-up-sender', {}, 90_000);
      break;
    case 'job-harvest':
      await harvestJobRecruiterUrls();
      break;
    default:
      await log(`[Scenario] Unknown scenario id: ${scenarioId}`, 'error');
  }
}

/**
 * Runs the selected scenarios N times back-to-back.
 * Advances the day cycle and auto-exports named CSVs after each iteration.
 * Inserts a 5–10 min pause between iterations.
 *
 * @param {string[]} scenarioIds
 * @param {number}   n
 */
async function runSelectedScenarios(scenarioIds, n) {
  const safeN = Math.max(1, Math.min(10, n));
  const ids   = Array.isArray(scenarioIds) && scenarioIds.length ? scenarioIds : ['full-pipeline'];

  await chrome.storage.local.set({
    pendingRuns: safeN, totalRunsSession: safeN, currentRunNumber: 0,
    activeScenarios: ids,
  });

  for (let i = 0; i < safeN; i++) {
    await chrome.storage.local.set({ currentRunNumber: i + 1 });
    const cap = await getDailyConnectionCap();
    await log(`[RunSelected ${i + 1}/${safeN}] Scenarios: ${ids.join(', ')} | cap: ${cap}`, 'warn');

    for (const id of ids) {
      await runScenario(id, cap);
    }

    await advanceDayCycle();

    // Auto-export with a slug derived from the selected scenario ids
    const slug = ids.map(s => s.replace(/-/g, '')).join('_').slice(0, 40);
    await exportAllCsvs(slug);

    const remaining = safeN - i - 1;
    await chrome.storage.local.set({ pendingRuns: remaining });

    if (remaining > 0) {
      const waitMs = (5 + Math.floor(Math.random() * 6)) * 60 * 1000; // 5–10 min
      await log(
        `[RunSelected ${i + 1}/${safeN}] Done. Waiting ${Math.round(waitMs / 60000)} min before run ${i + 2}…`,
        'info'
      );
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  await chrome.storage.local.set({ pendingRuns: 0 });
  await log(`[RunSelected] All ${safeN} run(s) complete.`, 'success');
}

// ─── CSV auto-export ──────────────────────────────────────────────────────────

function csvRow(values) {
  return values.map(v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(',');
}

function downloadCsvFromSW(filename, headers, rows) {
  const lines = [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
  // Service workers cannot use URL.createObjectURL — use a data URL instead
  const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + lines);
  chrome.downloads.download({ url: dataUrl, filename: `link_ssi/output/${filename}`, saveAs: false });
}

/**
 * FILE 1 — activity-log-{ts}.csv
 * Pure chronological activity log. Headers: Date | Level | Script | Message
 */
async function exportLogCsv(scenarioId = '') {
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  const ts = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
<<<<<<< HEAD
  const slug = scenarioId ? `${scenarioId}-` : '';
  const HEADERS = ['Date', 'Level', 'Script', 'Message'];
  const rows = [...activityLog]
<809 linhas não mostradas>
