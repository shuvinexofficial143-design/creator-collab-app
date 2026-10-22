import { redirect } from 'next/navigation';
import { db } from './supabase';
import { configured } from './config';
export async function account(admin = false) {
 if(!configured()) redirect('/setup');
 const client=await db(); const {data:{user}}=await client.auth.getUser();
 if(!user) redirect('/auth/login');
 const {data:profile,error}=await client.from('profiles').select('*').eq('id',user.id).single();
 if(error || !profile || !profile.active) redirect('/auth/login?error=Account%20unavailable');
 if(admin && profile.role!=='ADMIN') redirect('/workspace');
 return {client,user,profile};
}
