import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationStatus} from '../platform/setup-health.mjs';
test('configuration health shows pending requirements without leaking secrets',()=>{
 const status=configurationStatus({HUBIE_AUTH_ENABLED:'false',HUBIE_PUBLIC_ORIGIN:'https://hubie-pwa-staging.onrender.com',HUBIE_INITIAL_ADMIN_EMAIL:'juliiocontreras@gmail.com'});
 assert.deepEqual(status,{databaseConfigured:false,googleConfigured:false,adminConfigured:true,authEnabled:false,readyForLive:false});
 assert.ok(!JSON.stringify(status).includes('gmail'));
});
test('configuration health only reports ready with both credentials, origin, admin, and enabled flag',()=>{
 const env={TURSO_DATABASE_URL:'libsql://private.turso.io',TURSO_AUTH_TOKEN:'secret-database-token',
 GOOGLE_CLIENT_ID:'123.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'secret-oauth',
 HUBIE_AUTH_ENABLED:'true',HUBIE_PUBLIC_ORIGIN:'https://hubie-pwa-staging.onrender.com',
 HUBIE_INITIAL_ADMIN_EMAIL:'juliiocontreras@gmail.com'};
 assert.equal(configurationStatus(env).readyForLive,true);
 assert.equal(configurationStatus({...env,TURSO_AUTH_TOKEN:''}).readyForLive,false);
 assert.equal(configurationStatus({...env,HUBIE_AUTH_ENABLED:'false'}).readyForLive,false);
 assert.equal(configurationStatus({...env,HUBIE_PUBLIC_ORIGIN:'https://other.com/path'}).readyForLive,false);
});
