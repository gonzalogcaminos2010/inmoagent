CREATE TABLE global_demo_budget(period text PRIMARY KEY,currency text NOT NULL CHECK(currency='ARS'),reserved bigint NOT NULL DEFAULT 0,consumed bigint NOT NULL DEFAULT 0,cap bigint NOT NULL DEFAULT 20000);
REVOKE ALL ON global_demo_budget FROM PUBLIC,inmo_app;
CREATE UNIQUE INDEX reservation_key ON reservations(tenant_id,(data->>'key')) WHERE data ? 'key';
CREATE FUNCTION reserve_demo_budget(p_id text,p_key text,p_period text,p_est bigint,p_currency text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t text:=current_setting('app.tenant_id',true);g global_demo_budget;u jsonb;r jsonb;uid text:=p_period||':ARS';
BEGIN
 IF t IS NULL OR t='' OR p_est<=0 OR p_currency<>'ARS' OR p_period !~ '^[0-9]{4}-[0-9]{2}$' THEN RAISE EXCEPTION 'Presupuesto inválido'; END IF;
 INSERT INTO global_demo_budget(period,currency) VALUES(p_period,p_currency) ON CONFLICT DO NOTHING;
 SELECT * INTO g FROM global_demo_budget WHERE period=p_period FOR UPDATE;
 SELECT data INTO r FROM reservations WHERE tenant_id=t AND data->>'key'=p_key;
 IF r IS NOT NULL THEN RETURN r->>'id'; END IF;
 INSERT INTO usage(tenant_id,id,data) VALUES(t,uid,jsonb_build_object('tenantId',t,'id',uid,'period',p_period,'currency','ARS','reservedMinor',0,'consumedMinor',0,'limitMinor',10000,'blocked',false)) ON CONFLICT DO NOTHING;
 SELECT data INTO u FROM usage WHERE tenant_id=t AND id=uid FOR UPDATE;
 IF coalesce((u->>'blocked')::boolean,false) OR (u->>'reservedMinor')::bigint+(u->>'consumedMinor')::bigint+p_est>(u->>'limitMinor')::bigint OR g.reserved+g.consumed+p_est>g.cap THEN RAISE EXCEPTION 'Presupuesto agotado'; END IF;
 UPDATE global_demo_budget SET reserved=reserved+p_est WHERE period=p_period;
 UPDATE usage SET data=jsonb_set(u,'{reservedMinor}',to_jsonb((u->>'reservedMinor')::bigint+p_est)) WHERE tenant_id=t AND id=uid;
 INSERT INTO reservations(tenant_id,id,data) VALUES(t,p_id,jsonb_build_object('tenantId',t,'id',p_id,'key',p_key,'period',p_period,'currency',p_currency,'estimatedMinor',p_est,'status','reserved','usageId',uid));
 RETURN p_id;
END $$;
CREATE FUNCTION settle_demo_budget(p_id text,p_actual bigint,p_release boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t text:=current_setting('app.tenant_id',true);r jsonb;u jsonb;est bigint;actual bigint;v_period text;
BEGIN
 IF t IS NULL OR t='' OR p_actual<0 THEN RAISE EXCEPTION 'Reserva inválida'; END IF;
 SELECT data INTO r FROM reservations WHERE tenant_id=t AND id=p_id;
 IF r IS NULL THEN RAISE EXCEPTION 'Reserva no encontrada'; END IF;
 v_period:=r->>'period';PERFORM 1 FROM global_demo_budget WHERE global_demo_budget.period=v_period FOR UPDATE;
 SELECT data INTO r FROM reservations WHERE tenant_id=t AND id=p_id FOR UPDATE;
 IF r->>'status'<>'reserved' THEN RETURN; END IF;
 SELECT data INTO u FROM usage WHERE tenant_id=t AND id=r->>'usageId' FOR UPDATE;
 est:=(r->>'estimatedMinor')::bigint;actual:=CASE WHEN p_release THEN 0 ELSE p_actual END;
 UPDATE global_demo_budget SET reserved=reserved-est,consumed=consumed+actual WHERE global_demo_budget.period=v_period;
 UPDATE usage SET data=u||jsonb_build_object('reservedMinor',(u->>'reservedMinor')::bigint-est,'consumedMinor',(u->>'consumedMinor')::bigint+actual,'blocked',coalesce((u->>'blocked')::boolean,false) OR actual>est,'discrepancy',coalesce((u->>'discrepancy')::boolean,false) OR actual>est) WHERE tenant_id=t AND id=r->>'usageId';
 UPDATE reservations SET data=r||jsonb_build_object('status',CASE WHEN p_release THEN 'released' ELSE 'settled' END,'actualMinor',actual) WHERE tenant_id=t AND id=p_id;
END $$;
REVOKE ALL ON FUNCTION reserve_demo_budget(text,text,text,bigint,text),settle_demo_budget(text,bigint,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reserve_demo_budget(text,text,text,bigint,text),settle_demo_budget(text,bigint,boolean) TO inmo_app;
