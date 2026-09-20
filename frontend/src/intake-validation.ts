import { easternDate } from './api';

export type IntakeForm = {
  booking_name: string; support: string; description: string; center: string; modality: string;
  first_date: string; last_date: string; after: string; before: string;
  student: string; counseling: string; acknowledged: boolean;
};
export const emptyIntake = (): IntakeForm => ({booking_name:'',support:'',description:'',center:'',modality:'',
  first_date:'',last_date:'',after:'',before:'',student:'',counseling:'',acknowledged:false});
export const needsCounseling = (f:IntakeForm) => ['counseling','unsure'].includes(f.support) || ['cook','timelycare'].includes(f.center);
// Allowlist the request fields: presentation-only values must never leak into AI or storage.
export function intakePayload(f:IntakeForm, request_id:string) {
  return {request_id,booking_name:f.booking_name.trim(),description:f.description.trim(),
    support:f.support,center:f.center,modality:f.modality,student:f.student,
    first_date:f.first_date,last_date:f.last_date,after:f.after,before:f.before,
    counseling:needsCounseling(f)?f.counseling:null,acknowledged:f.acknowledged};
}
export function intakeErrors(f:IntakeForm): Record<string,string> {
  const e:Record<string,string>={};
  if (!f.booking_name.trim() || f.booking_name.trim().length>80) e.booking_name='Enter a name or alias, up to 80 characters.';
  if (!['physical','counseling','wellness','unsure'].includes(f.support)) e.support='Choose a kind of support.';
  if (f.description.trim().length<3 || f.description.trim().length>600) e.description='Briefly describe the help you want (3â€“600 characters).';
  if (!['auto','cook','schiffert','timelycare','carilion','wellness'].includes(f.center)) e.center='Choose a center or let us choose.';
  if (!['in-person','virtual','either'].includes(f.modality)) e.modality='Choose your visit preference.';
  if (!f.first_date || f.first_date<easternDate() || f.first_date>'2027-05-12') e.first_date='Choose a date from today through May 12, 2027.';
  if (!f.last_date || f.last_date<f.first_date || f.last_date>'2027-05-12') e.last_date='Choose an end date on or after your first date, through May 12, 2027.';
  const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
  if (!f.after || !f.before || minutes(f.before)-minutes(f.after)<30) e.hours='Allow at least 30 minutes for your visit.';
  if (!['yes','no'].includes(f.student)) e.student='Choose your student status.';
  if (needsCounseling(f) && !['cook','timelycare','elsewhere','none','unsure'].includes(f.counseling)) e.counseling='Choose your current counseling situation.';
  if (!f.acknowledged) e.acknowledged='Acknowledge that this is a sample booking.';
  return e;
}
