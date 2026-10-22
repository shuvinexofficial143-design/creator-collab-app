'use server';
import {revalidatePath} from 'next/cache';
import {account} from '@/lib/auth';
import {projectSchema,uuid} from '@/lib/validation';
import type {Result} from '@/components/action-form';
export async function mutate(op:string,_:Result,form:FormData):Promise<Result>{
 const {client}=await account(['project','decision','review','payment','dispatch'].includes(op));
 const raw=String(form.get('target')||''); if(raw&&!uuid.safeParse(raw).success)return {error:'Invalid record.'};
 let payload:Record<string,unknown>=Object.fromEntries(form.entries());delete payload.target;
 if(op==='project'){
 const date=new Date(String(payload.deadline));if(Number.isNaN(date.getTime()))return {error:'Select a valid deadline.'};
 payload.deadline=date.toISOString();payload.payment_paise=Math.round(Number(payload.payment_rupees)*100);
 const parsed=projectSchema.safeParse(payload);if(!parsed.success)return {error:parsed.error.issues[0].message};payload=parsed.data;
 }
 const {error}=await client.rpc('workflow',{op,target:raw||null,payload});
 if(error){const known=['Application is not pending','Applications are closed','Project is closed or full','Rejection reason required','Revision instructions required','Payment already paid or unavailable','Courier and tracking required','Delivery address required before dispatch','Address cannot be changed after dispatch','Complete delivery address required','Product has not been dispatched'];return {error:error.code==='23505'?'This record already exists. You may have already completed this action.':known.find(x=>error.message.includes(x))||'Unable to save. Check the fields and current workflow status.'};}
 revalidatePath('/workspace','layout');return {success:'Saved successfully.'};
}
