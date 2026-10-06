export function mondayOf(date){const start=new Date(date);start.setHours(12,0,0,0);start.setDate(start.getDate()-(start.getDay()+6)%7);return start;}
export function weekDates(date){const start=mondayOf(date);return Array.from({length:7},(_,i)=>{const value=new Date(start);value.setDate(start.getDate()+i);return value;});}
export function shiftWeek(dates,offset){const start=new Date(dates[0]);start.setDate(start.getDate()+offset*7);return weekDates(start);}
