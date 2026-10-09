CREATE OR REPLACE FUNCTION settle_demo_budget(p_id text,p_actual bigint,p_release boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
