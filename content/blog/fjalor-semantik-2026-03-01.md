---
title: "Fjalori Semantik, Si unë krijova një fjalor në të cilin mund të kërkosh me përshkrimin e fjalëve."
date: 2026-03-01T16:55:00Z
authors: ["zerocase"]
tags: ["fjalor", "semantikë", "gjuhë"]
description: "Si unë krijova një fjalor në të cilin mund të kërkosh me përshkrimin e fjalëve."
nextprev: true
taglist: true
---


Fjalorët janë nga mjetet e mia të preferuara, pasi për të shkruar është e rëndësishme të konsultohem me një fjalor për t'a bërë shkrimin sa më interesant.

Në parim të gjithë fjalorët që ekzistojnë tashmë online dhe në libra janë funksionalë për të gjetur kuptimet e fjalëve, por gjithmonë unë kam qenë i interesuar në një fjalor të cilin e kërkon nëpërmjet përshkrimit të fjalës, pasi ka raste që mund të di përshkrimin e një fjale dhe jo vetë fjalën. Në këtë mënyrë lindi fjalori semantik.

Së pari dua të vendos një definim për fjalën "Semantikë" sipas fjalorit: _Përmbajtja kuptimore e njësive të gjuhës; kuptimi leksikor i fjalëve dhe i shprehjeve._


## Baza e të dhënave: 37,000 fjalë nga Wiktionary

Para se të përqendrohemi në përpunimin e gjuhës natyrore, së pari duhej të krijoja një bazë të dhënash. Fatmirësisht, vullnetarët e Wiktionary e kanë bërë këtë punë të lehtë duke nxjerrë rreth 37,000 fjalë, të gjitha të definuara dhe lehtësisht të kërkueshme. Duke qenë se është një projekt i hapur, mund të ekstraktosh një skedar XML në të cilin janë të gjitha fjalët bashkë me përshkrimet e tyre.

Fatmirësisht dhe fatkeqësisht, formati ishte XML dhe për të bërë ekstraktimin duhej të luftoje me disa formate të ndryshme, të cilat nuk janë gjithmonë standarde, duke qenë se këto përshkrime janë mbushur nga vullnetarë. Pas shumë lufte me regex, më në fund ja dola të nxirrja të gjitha fjalët dhe t'i nxirrja në një skedar JSON.

Çdo fjalë mund të ketë disa kuptime të ndara, kështu që skema e bazës së të dhënave i mban ato si rreshta të veçantë me një fushë `sense_idx`. Kjo do të thotë se në total kemi **40,214 rreshta** për rreth 37,000 fjalë unike. Ja si duket skema reale e tabelës:

```
Table "public.dictionary_entries"
    Column      |            Type
----------------+-----------------------------
 id             | integer
 word           | text
 part_of_speech | text
 definition     | text
 embedding      | vector(768)
 created_at     | timestamp
 sense_idx      | integer
```

Dhe disa shembuj nga të dhënat reale:

```
word             | pos  | sense | definition
------------------+------+-------+--------------------------------------------------
 aerodinamikë     |      |   0   | (fiz.) Pjesë e fizikës, që studion ligjet e lëvizjes së ajrit...
 abordazh         | Emër |   0   | Mënyrë e vjetër luftimi në det, kur anijet puqeshin e kapeshin...
 abshisë          | f.   |   0   | Njëra nga koordinatat, që shërbejnë për të përcaktuar vendin...
 abstenim         | m.   |   0   | Veprimi sipas kuptimit te foljes ABSTENOJ. Abstenimi i disa anëtarëve.
 abstenim         | m.   |   1   | Qëndrim as «po» as «jo» gjatë votimit për një çështje...
 abstraksionizëm  | m.   |   0   | Rrymë krejt formaliste e subjektiviste në artin e sotëm...
 abetare          | f.   |   0   | Libër fillestar për të mësuar shkrim e këndim.
```

Baza e të dhënave në total zë ~**350 MB**, shumica e të cilave vijnë nga vektorët e embeddings.

## Çfarë janë embeddings dhe si funksionojnë?

Për të kryer këtë lloj kërkimi, ku merret përmbajtja kuptimore si bazë e jo vetë fjala, duhet të bëjmë përpunim të gjuhës natyrore duke shndërruar tekstet në embeddings.

**Embeddings**, në rastin e Large Language Models (LLM), janë vektorë shumë-dimensionalë të cilët konvertohen nëpërmjet modeleve për ta bërë përmbajtjen e tekstit të "lexueshëm" nga LLM. Në rastin tonë, çdo definicion i fjalës shndërrohet në një vektor me **768 dimensione** një listë me 768 numra me presje dhjetore që përfaqësojnë kuptimin e atij teksti në hapësirën vektoriale.

Kur një përdorues kërkon "ëmbëlsirë me qumësht dhe oriz", pyetja e tij gjithashtu shndërrohet në një vektor 768-dimensional, dhe sistemi gjen vektorët më të afërt në bazë të **kosinusit të ngjashmërisë** një matje gjeometrike e këndit mes dy vektorëve. Sa më i vogël këndi, aq më i ngjashëm kuptimi.

---
## Zgjedhja e modelit: Pse paraphrase-multilingual-mpnet-base-v2

Problemi kryesor ishte që nuk ka shumë modele të trajnuara me gjuhën shqipe. Testova dy kandidatë:

- **multilingual-e5-large** raportoi saktësi të mirë me shqipen, por në praktikë kishte një shkëputje nga shpjegimet kuptimore
- **paraphrase-multilingual-mpnet-base-v2** pas një rregullimi të vogël (kodi i kërkimit po përdorte ende e5 për vektorizim), funksionoi si magji

Gabimi ishte i thjeshtë: vektorizimi i bazës së të dhënave dhe vektorizimi i query-t duhet të përdorin _të njëjtin model_. Nëse i vektorizon definicionet me modelin A dhe query-n me modelin B, rezultatet nuk kanë kuptim, pavarësisht sa të mirë janë modelet veçmas.

---
## Infrastruktura: PostgreSQL + pgvector

Nëpërmjet Docker krijova një bazë të dhënash PostgreSQL me shtesën `pgvector` për të mbajtur embeddings:

```bash
docker run -d \
  --name postgres \
  --restart always \
  -e POSTGRES_USER=semantike \
  -e POSTGRES_DB=kerkim_semantik \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Për kërkimin vektorial, tabela përdor një **IVFFlat index** me 100 lista një strukturë indeksi që ndan hapësirën vektoriale në grupe (clusters) për të shmangur krahasimin e çdo vektori me çdo pyetje. Kjo është arsyeja pse kërkimi është i shpejtë edhe me 40,000 rreshta:

```sql
CREATE INDEX dictionary_entries_embedding_idx
  ON dictionary_entries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = '100');
```

Gjithashtu ka dy indekse GIN për kërkim tekstual të zakonshëm (jo-semantik) si fallback, me një konfigurim të personalizuar për shqipen:

```sql
CREATE INDEX idx_definition ON dictionary_entries
  USING gin (to_tsvector('albanian_unaccent', definition));

CREATE INDEX idx_word ON dictionary_entries
  USING gin (to_tsvector('albanian_unaccent', word));
```


## Stack-u i plotë i deployment-it

Frontend-i është ndërtuar me **Django**, i shërbyer nëpërmjet **Gunicorn** me 2 workers, pas **Nginx** si reverse proxy. E gjithë kjo ekzekutohet në një **EC2 t3.large** instance në AWS (eu-north-1).

```
Interneti
    ↓
  Nginx  (reverse proxy, static files)
    ↓
  Gunicorn  (2 workers, unix socket)
    ↓
  Django  (kërkimi + logjika)
    ↓
  Redis  (cache)    PostgreSQL + pgvector  (vektorët)
```

Konfigurimi i Gunicorn si systemd service sigurohet që procesi riniset automatikisht nëse bie:

```ini
[Service]
User=ubuntu
Group=www-data
UMask=0007
WorkingDirectory=/home/ubuntu/fjalor_semantik_front
ExecStart=/home/ubuntu/fjalor_semantik_front/env/bin/gunicorn \
    fjalor_semantik_front.wsgi:application \
    --workers 2 \
    --bind unix:/home/ubuntu/fjalor_semantik_front/gunicorn.sock
Restart=always
```

Komunikimi mes Nginx dhe Gunicorn bëhet nëpërmjet **Unix socket** dhe jo TCP port  kjo eliminon overhead-in e rrjetit për komunikimin lokal mes dy proceseve në të njëjtin server.


## Performanca: matje reale

Duke ekzekutuar kërkime reale nga jashtë serverit (nga Evropa Perëndimore drejt eu-north-1):

```
$ curl -w "%{time_total}s\n" "https://fjalor-semantik.com/search/?q=ëmbëlsirë+me+qumësht"
0.139983s

$ curl -w "%{time_total}s\n" "https://fjalor-semantik.com/search/?q=ndërtesë+e+shenjtë"
0.134779s

$ curl -w "%{time_total}s\n" "https://fjalor-semantik.com/search/?q=forca+që+tërheq+trupat"
0.140885s
```

Rreth **~140ms** për kërkimet end-to-end, duke përfshirë: vektorizimin e query-t nga modeli, kërkimin e ngjashmërisë kosinusale në 40,000 vektorë, dhe kthimin e rezultateve. Ky është një kohë mjaft e mirë për një server të vetëm pa asnjë optimizim të veçantë.

Redis është konfiguruar për caching të rezultateve kërkesat e përsëritura nuk do të kalojnë nëpër modelin e embeddings fare.


## Sugjerime për kërkime

- _Ëmbëlsirë me qumësht dhe oriz_
- _Ndërtesë e shenjtë krishterë/myslimane/bektashie_
- _Forca që tërheq trupat drejt tokës_

Kualiteti i rezultateve gjithmonë varet nga detajet e përshkrimit sa më specifik, aq më të mira rezultatet.


## Çfarë mund të përmirësohet?

- **Përditësime në kohë reale** për ta mbajtur fjalorin gjithmonë të freskët do të ishte mirë të tërhiqeshin përditësimet që bëhen në Wiktionary automatikisht.

- **Fine-Tuning i modelit** nëse bëhet një fine-tune me përshkrime më natyrore që mund t'i shkruajë një përdorues (jo vetëm definicione fjalori), kërkimi ka për të qenë më i saktë.

- **Modele me cilësi më të lartë** nëse përdoren modele embeddings nga OpenAI, të cilët kanë një korpus më të lartë trajnimi me shqipen, kualiteti do të jetë edhe më i mirë. Por dëshira ime ishte të krijoja një fjalor të tillë të cilin mund ta rikrijojë çdo kush.

- **Përmirësimi i vetë përshkrimeve** një mënyrë se si ti mund të ndihmosh sot është duke kontribuar në Wiktionary, ku kushdo mund të bëjë përmirësime.


Për momentin fjalori është online në [fjalor-semantik.com](https://fjalor-semantik.com) dhe mund ta provoni që tani.

Nëse dëshironi të ndihmoni mbajtjen e fjalorit në punë, do ta vlerësoja një donacion.

https://ko-fi.com/fjalorsemantik
