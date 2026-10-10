-- BANCO DE DADOS: Barraca do Prando. Cole TUDO no SQL Editor do Supabase e clique em Run.
create table public.produtos(
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  ordem int not null default 0);
create table public.produto_unidades(
  produto_id bigint not null references public.produtos on delete cascade,
  unidade text not null check (unidade in ('kg','g','un','pote','pacote','litro')),
  preco numeric(8,2) not null check (preco >= 0),
  primary key(produto_id, unidade));
create table public.encomendas(
  id bigint generated always as identity primary key,  -- o id é o número da encomenda
  nome text not null,
  telefone text,
  retirada date,
  obs text,
  status text not null default 'pendente' check (status in ('pendente','confirmado','separado','entregue','cancelado')),
  origem text not null default 'online' check (origem in ('online','balcao')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now());
create table public.itens_encomenda(
  id bigint generated always as identity primary key,
  encomenda_id bigint not null references public.encomendas on delete cascade,
  produto_id bigint references public.produtos on delete set null,
  nome_produto text not null,
  quantidade numeric(8,2) not null check (quantidade > 0),
  unidade text not null,
  preco_unit numeric(8,2) not null);
create table public.admins(email text primary key);

-- Quem é administrador
insert into public.admins values ('luisalternativo3@gmail.com');
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from admins where email = lower(auth.jwt()->>'email')) $$;

-- Segurança: ninguém lê nada diretamente, só o administrador logado
revoke all on all tables in schema public from anon;
do $$ declare t text; begin
  foreach t in array array['produtos','produto_unidades','encomendas','itens_encomenda','admins'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy adm_total on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop; end $$;

-- Produtos e preços iniciais (editáveis depois pelo painel)
insert into public.produtos(nome, ordem) values
 ('Paleta',1),('Lombo',2),('Copa lombo',3),('Pernil',4),('Pá',5),('Barriguinha',6),('Costela',7),
 ('Linguiça grossa',8),('Linguiça fina',9),('Chouriço',10),('Escudiguim',11),
 ('Torresmo',12),('Banha',13),('Pé',14),('Orelha',15);
insert into public.produto_unidades select id,'kg',20 from public.produtos where nome in ('Paleta','Lombo','Copa lombo','Pernil','Pá');
insert into public.produto_unidades select id,'kg',18 from public.produtos where nome='Barriguinha';
insert into public.produto_unidades select id,'kg',23 from public.produtos where nome='Costela';
insert into public.produto_unidades select id,u,20 from public.produtos, unnest(array['kg','pacote']) u where nome in ('Linguiça grossa','Linguiça fina','Chouriço','Escudiguim');
insert into public.produto_unidades select id,'pacote',12 from public.produtos where nome='Torresmo';
insert into public.produto_unidades select id,'litro',25 from public.produtos where nome='Banha';
insert into public.produto_unidades select id,'kg',8 from public.produtos where nome in ('Pé','Orelha');

-- Lista pública de produtos ativos (sem dados de clientes)
create function public.listar_produtos() returns jsonb language sql stable security definer set search_path = public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'unidades',
   (select jsonb_agg(jsonb_build_object('unidade',u.unidade,'preco',u.preco) order by u.unidade) from produto_unidades u where u.produto_id=p.id))
   order by p.ordem,p.nome),'[]'::jsonb)
 from produtos p where p.ativo and exists(select 1 from produto_unidades u where u.produto_id=p.id) $$;

-- Cadastro público de encomenda, com validação no servidor
create function public.criar_encomenda(p_nome text, p_telefone text, p_retirada date, p_obs text, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint; it jsonb; v_qtd numeric; v_un text; v_pid bigint; v_nome text; v_preco numeric; v_tel text; v_out jsonb := '[]'::jsonb;
begin
  p_nome := btrim(coalesce(p_nome,''));
  if char_length(p_nome) not between 2 and 80 then raise exception 'Informe seu nome.'; end if;
  v_tel := nullif(regexp_replace(coalesce(p_telefone,''),'\D','','g'),'');
  if v_tel is not null and char_length(v_tel) not between 10 and 13 then raise exception 'Telefone inválido. Use DDD + número.'; end if;
  if p_retirada is not null and p_retirada < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data de retirada não pode ser no passado.'; end if;
  if char_length(coalesce(p_obs,'')) > 500 then raise exception 'Observações muito longas.'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) not between 1 and 30 then raise exception 'Adicione de 1 a 30 produtos.'; end if;
  insert into encomendas(nome,telefone,retirada,obs) values (p_nome,v_tel,p_retirada,nullif(btrim(coalesce(p_obs,'')),'')) returning id into v_id;
  for it in select * from jsonb_array_elements(p_itens) loop
    v_nome := null;
    v_pid := (it->>'produto_id')::bigint; v_qtd := (it->>'quantidade')::numeric; v_un := it->>'unidade';
    if v_qtd is null or v_qtd <= 0 or v_qtd > 9999 then raise exception 'Quantidade inválida.'; end if;
    if v_un <> 'kg' and v_qtd <> trunc(v_qtd) then raise exception 'Use números inteiros nesta unidade.'; end if;
    select p.nome, u.preco into v_nome, v_preco from produtos p join produto_unidades u on u.produto_id=p.id where p.id=v_pid and p.ativo and u.unidade=v_un;
    if v_nome is null then raise exception 'Produto ou unidade indisponível.'; end if;
    insert into itens_encomenda(encomenda_id,produto_id,nome_produto,quantidade,unidade,preco_unit) values (v_id,v_pid,v_nome,v_qtd,v_un,v_preco);
    v_out := v_out || jsonb_build_object('nome',v_nome,'quantidade',v_qtd,'unidade',v_un);
  end loop;
  return jsonb_build_object('numero', v_id, 'itens', v_out);
end $$;

revoke all on function public.listar_produtos(), public.criar_encomenda(text,text,date,text,jsonb) from public;
grant execute on function public.listar_produtos(), public.criar_encomenda(text,text,date,text,jsonb) to anon, authenticated;
