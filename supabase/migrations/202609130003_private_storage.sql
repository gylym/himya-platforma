-- Apply only after the signed-URL frontend is deployed.
begin;
update storage.buckets set public=false,file_size_limit=20971520 where id='content-assets';
commit;
