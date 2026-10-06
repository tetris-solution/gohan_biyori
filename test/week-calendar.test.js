import test from 'node:test';
import assert from 'node:assert/strict';
import {weekDates,shiftWeek} from '../public/src/week-calendar.js';
const key=d=>d.toLocaleDateString('sv-SE');
test('calendar starts Monday and includes today across month and year boundaries',()=>{
 for(const [date,start,end] of [['2026-10-06','2026-10-05','2026-10-11'],['2026-10-11','2026-10-05','2026-10-11'],['2026-10-12','2026-10-12','2026-10-18'],['2027-01-01','2026-12-28','2027-01-03']]){const input=new Date(date+'T12:00:00'),week=weekDates(input);assert.equal(week.length,7);assert.equal(key(week[0]),start);assert.equal(key(week[6]),end);assert.deepEqual(week.map(d=>d.getDay()),[1,2,3,4,5,6,0]);assert.equal(key(input),date);}
});
test('previous and next week retain weekday order and do not mutate the current week',()=>{const week=weekDates(new Date('2026-12-31T12:00:00'));assert.equal(key(shiftWeek(week,1)[0]),'2027-01-04');assert.equal(key(shiftWeek(week,-1)[0]),'2026-12-21');assert.equal(key(week[0]),'2026-12-28');assert.deepEqual(shiftWeek(shiftWeek(week,1),-1).map(key),week.map(key));});
