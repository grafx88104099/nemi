// ============== Нэми Mock Data ==============
window.NEMI_DATA = (() => {
  const districts = ["Сүхбаатар", "Чингэлтэй", "Хан-Уул", "Баянгол", "Сонгинохайрхан", "Баянзүрх", "Налайх"];
  const types = ["Орон сууц", "Хаус", "Газар", "Оффис", "Худалдааны талбай"];

  const offices = [
    { id: "of-01", name: "Голден Хаус", logo: "GH", agents: 12, listings: 86, color: "#C2410C", verified: true },
    { id: "of-02", name: "Urban Realty", logo: "UR", agents: 24, listings: 134, color: "#1D4ED8", verified: true },
    { id: "of-03", name: "Premium Estate", logo: "PE", agents: 18, listings: 102, color: "#9333EA", verified: true },
    { id: "of-04", name: "Сити Хоум", logo: "СХ", agents: 9, listings: 41, color: "#B91C1C", verified: false },
  ];

  const agents = [
    { id: "ag-01", name: "Б. Анхбаяр",  office: "Голден Хаус",   officeId: "of-01", phone: "+976 9911 2233", listings: 14, sold: 38, rating: 4.9, reviews: 142, years: 6, verified: true,  premier:true,  responseTime:"~12 минут", languages: ["Монгол","Англи"],       areas:["Хан-Уул","Сүхбаатар","Зайсан"],     specialty:"Лакшери орон сууц",     avatar:"AB", bio:"6 жил Хан-Уул, Сүхбаатарт ажиллаж байна. River Garden, Encanto зэрэг premium хотхонтой нягт хамтрах туршлагатай. Англи хэлээр чөлөөтэй ярьдаг тул гадаад харилцагчдыг хүлээн авахад тохиромжтой.", subRatings:{ knowledge:4.9, process:4.8, response:5.0, negotiation:4.8 } },
    { id: "ag-02", name: "Д. Сэлэнгэ",   office: "Urban Realty",  officeId: "of-02", phone: "+976 8800 4455", listings: 22, sold: 67, rating: 4.8, reviews: 213, years: 8, verified: true,  premier:true,  responseTime:"~8 минут",  languages: ["Монгол","Англи","Хятад"], areas:["Сүхбаатар","Чингэлтэй"],            specialty:"Шинэ хотхон",            avatar:"DS", bio:"Шинэ хотхоны борлуулалтанд 8 жил мэргэшсэн. Хятад хэлтэй учир гадаадын инвесторуудтай хамтран ажиллах боломжтой.", subRatings:{ knowledge:4.9, process:4.7, response:4.9, negotiation:4.7 } },
    { id: "ag-03", name: "Н. Энхжаргал", office: "Premium Estate",officeId: "of-03", phone: "+976 9966 7788", listings: 18, sold: 52, rating: 4.9, reviews: 98,  years: 5, verified: true,  premier:true,  responseTime:"~15 минут", languages: ["Монгол","Англи"],       areas:["Хан-Уул","Зайсан","Их тэнгэр"],     specialty:"Хаус ба газар",          avatar:"NE", bio:"Зайсан, Их тэнгэрийн хороололд хувийн хаус, газрын борлуулалт мэргэшсэн. Гэр бүлд тохиромжтой обьект олох шилдэг.", subRatings:{ knowledge:5.0, process:4.9, response:4.7, negotiation:5.0 } },
    { id: "ag-04", name: "Т. Мөнхзул",   office: "Голден Хаус",   officeId: "of-01", phone: "+976 9555 1212", listings: 11, sold: 24, rating: 4.7, reviews: 64,  years: 3, verified: true,  premier:false, responseTime:"~25 минут", languages: ["Монгол","Орос"],         areas:["Сүхбаатар","Баянгол"],              specialty:"Хувийн орон сууц",       avatar:"TM", bio:"Орос хэлтэй, дунд орлоготой гэр бүлийн худалдан авагчдад туслахад дуртай. Сүхбаатар, Баянгол дүүрэгт мэргэшсэн.", subRatings:{ knowledge:4.6, process:4.7, response:4.8, negotiation:4.7 } },
    { id: "ag-05", name: "Х. Батсайхан", office: "Urban Realty",  officeId: "of-02", phone: "+976 8800 9090", listings: 9,  sold: 15, rating: 4.6, reviews: 41,  years: 2, verified: false, premier:false, responseTime:"~40 минут", languages: ["Монгол"],                areas:["Сүхбаатар","Чингэлтэй"],            specialty:"Оффис ба худалдаа",      avatar:"XB", bio:"Оффис, худалдааны талбайн салбарт ажилладаг шинэ агент. Хямд үнэтэй коммерциал зар хайдаг бизнесүүдэд тусална.", subRatings:{ knowledge:4.4, process:4.5, response:4.7, negotiation:4.6 } },
    { id: "ag-06", name: "С. Алтанзул",  office: "Сити Хоум",     officeId: "of-04", phone: "+976 9090 3344", listings: 7,  sold: 12, rating: 4.5, reviews: 33,  years: 2, verified: false, premier:false, responseTime:"~1 цаг",    languages: ["Монгол"],                areas:["Баянзүрх","Чингэлтэй"],             specialty:"Эконом орон сууц",       avatar:"SA", bio:"Эхний орон сууцаа авч буй залуу гэр бүлүүдэд зориулсан хямд хувилбарууд олох мэргэжилтэн.", subRatings:{ knowledge:4.3, process:4.5, response:4.5, negotiation:4.4 } },
    { id: "ag-07", name: "О. Болормаа",  office: "Premium Estate",officeId: "of-03", phone: "+976 9966 1122", listings: 26, sold: 81, rating: 4.9, reviews: 256, years: 11,verified: true,  premier:true,  responseTime:"~6 минут",  languages: ["Монгол","Англи","Япон"],  areas:["Хан-Уул","Сүхбаатар","Зайсан","Эрдэнэт"], specialty:"Лакшери ба luxury",   avatar:"OB", bio:"11 жилийн туршлагатай, top-1 lakshery агент. Япон, Англи хэлтэй, гадаад VIP харилцагчдыг хүлээн авах боломжтой.", subRatings:{ knowledge:5.0, process:4.9, response:5.0, negotiation:4.9 } },
    { id: "ag-08", name: "Г. Эрдэнэбат", office: "Голден Хаус",   officeId: "of-01", phone: "+976 9911 4455", listings: 17, sold: 44, rating: 4.8, reviews: 187, years: 7, verified: true,  premier:true,  responseTime:"~10 минут", languages: ["Монгол","Англи"],         areas:["Баянзүрх","Сонгинохайрхан","Налайх"],specialty:"Хувьцаа байшин",        avatar:"GE", bio:"Гэр бүлд тохирох амьдрах орчны хайлтаар алдаршсан. Сонгинохайрхан, Налайх руу ажилладаг цөөн агентуудын нэг.", subRatings:{ knowledge:4.8, process:4.9, response:4.8, negotiation:4.7 } },
    { id: "ag-09", name: "Ц. Энхтуяа",   office: "Urban Realty",  officeId: "of-02", phone: "+976 8800 7766", listings: 13, sold: 29, rating: 4.7, reviews: 89,  years: 4, verified: true,  premier:false, responseTime:"~30 минут", languages: ["Монгол","Англи","Солонгос"], areas:["Чингэлтэй","Сүхбаатар"],             specialty:"Шинэ ашиглалт",       avatar:"CE", bio:"Шинэ ашиглалтанд орсон зарын нарийн мэдээллээр хэрэглэгчдэд туслахад дуртай.", subRatings:{ knowledge:4.7, process:4.6, response:4.8, negotiation:4.6 } },
    { id: "ag-10", name: "Б. Цэндсүрэн", office: "Сити Хоум",     officeId: "of-04", phone: "+976 9090 8899", listings: 5,  sold: 9,  rating: 4.4, reviews: 22,  years: 1, verified: false, premier:false, responseTime:"~2 цаг",    languages: ["Монгол"],                  areas:["Сонгинохайрхан","Налайх"],             specialty:"Хямд орон сууц",        avatar:"BC", bio:"Шинэ үе залуу агент. Эконом хувилбар хайж байгаа залуу хүмүүст түргэн хариу өгдөг.", subRatings:{ knowledge:4.2, process:4.4, response:4.3, negotiation:4.5 } },
    { id: "ag-11", name: "С. Очирбат",   office: "Premium Estate",officeId: "of-03", phone: "+976 9966 5544", listings: 31, sold: 96, rating: 4.9, reviews: 312, years: 13,verified: true,  premier:true,  responseTime:"~5 минут",  languages: ["Монгол","Англи","Хятад"],  areas:["Сүхбаатар","Хан-Уул","Зайсан"],         specialty:"Бүх төрөл",              avatar:"SO", bio:"Top-3 агент. 13 жил үл хөдлөхийн салбарт ажиллаж 96 хэлцэл хаасан. Чанартай үйлчилгээний жишиг.", subRatings:{ knowledge:5.0, process:5.0, response:5.0, negotiation:4.9 } },
    { id: "ag-12", name: "Д. Хулан",     office: "Голден Хаус",   officeId: "of-01", phone: "+976 9555 6677", listings: 10, sold: 19, rating: 4.7, reviews: 56,  years: 3, verified: true,  premier:false, responseTime:"~20 минут", languages: ["Монгол","Англи"],          areas:["Хан-Уул","Зайсан"],                     specialty:"Гэр бүлийн орон сууц", avatar:"DX", bio:"Гэр бүлд таалагдах гэр олоход үргэлж тэвчээртэй хандана. 3 жил Хан-Уул, Зайсангийн обьектод мэргэшсэн.", subRatings:{ knowledge:4.7, process:4.8, response:4.6, negotiation:4.7 } },
  ];

  // Mock review pool — re-used per agent profile page
  const reviewPool = [
    { name:"Б. Энхтуяа",   area:"Хан-Уул",   type:"Худалдан авсан", date:"2026-04-12", rating:5, verified:true,  text:"Маш мэргэжлийн, тэвчээртэй. Бид 3 байр үзсэн ч хүсэлд тохирох гэрийг олох хүртэл хүлээж тусалсан. Хариу хугацаа маш хурдан, асуултанд бүгдэд нь тодорхой хариулсан." },
    { name:"А. Цогзолмаа", area:"Сүхбаатар", type:"Зарсан",         date:"2026-03-28", rating:5, verified:true,  text:"Гэрээ 3 долоо хоногт зарж өгсөн. Үнэлгээ зөв тогтоосон, хайлтын стратеги нь үнэхээр ажилласан. Зөвлөж байна." },
    { name:"Д. Батбаяр",   area:"Зайсан",    type:"Худалдан авсан", date:"2026-03-15", rating:5, verified:false, text:"Олон агенттай харьцаж байсан ч энэ хүн л арилжаагаар мэргэжлийн хандсан. Урт хугацаанд ч тэвчээртэй." },
    { name:"Ч. Энхбаяр",   area:"Хан-Уул",   type:"Худалдан авсан", date:"2026-02-22", rating:4, verified:true,  text:"Сайн ажилласан. Заримдаа хариу удаа ирдэг боловч шаардлагатай мэдээллийг үнэн зөв өгдөг." },
    { name:"Х. Нармандах", area:"Чингэлтэй", type:"Худалдан авсан", date:"2026-02-09", rating:5, verified:true,  text:"Гэр бүлийн анхны байр авч байсан. Бүх үе шатанд тайлбарлаж, эрхзүйн асуудлуудыг шийдвэрлэхэд маш их тусалсан." },
    { name:"Т. Сараа",     area:"Сүхбаатар", type:"Зарсан",         date:"2026-01-30", rating:5, verified:true,  text:"Зарын зураг, описаниа маш сайн боловсруулсан. AI үнэлгээгээр нөгөө талын гаргасан үнийн саналыг харьцуулж зөв шийдвэр гаргахад тусалсан." },
    { name:"Б. Болормаа",  area:"Зайсан",    type:"Худалдан авсан", date:"2026-01-12", rating:5, verified:false, text:"Сэтгэлгээ нь тийм нөгөө талын хүн шиг бус, миний эрх ашгийг хамгаалж хэлэлцээ хийсэн." },
    { name:"Г. Дөлгөөн",   area:"Баянгол",   type:"Худалдан авсан", date:"2025-12-28", rating:4, verified:true,  text:"Зар олоход тусалсан. Хариу хугацаа арай удаа боловч мэдээлэл нь зөв." },
    { name:"Э. Болд",      area:"Сонгинохайрхан", type:"Худалдан авсан", date:"2025-12-10", rating:5, verified:true, text:"Сонгинохайрханд эх юм олох амар биш. Гэвч энэ агент 5 хувилбар үзүүлж, миний төсөв болон гэр бүлийн хэрэгцээнд тохирсон гэрийг олж өгсөн." },
    { name:"М. Алтанцэцэг",area:"Сүхбаатар", type:"Зарсан",         date:"2025-11-22", rating:5, verified:true,  text:"Зарын маркетинг бол шилдэг. Мэргэжлийн зураг авах, нийгмийн сүлжээнд цацах, дижитал тур — бүгдийг хариуцлагатай хийсэн." },
  ];

  const photos = [
    "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=900&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=80&auto=format&fit=crop",
  ];

  const listings = [
    { id:"L-2401", title:"Premium 3 өрөө · River Garden", district:"Хан-Уул", type:"Орон сууц", rooms:3, area:118, floor:"12/18", price:520_000_000, pricePerM2:4_407_000, year:2022, parking:1, photo:photos[0], photos:4, status:"active", agent:"ag-01", aiScore:96, aiNote:"Зах зээлийн дунджаас 3% доогуур үнэтэй", verified:true, hot:true, featured:true, shared:true, lat:47.905, lng:106.917, desc:"Шинэ ашиглалтад орсон, бүрэн гүйцэтгэлтэй, тавилгатай, Олимпийн гудамжинд байрлах.", amenities:["Лифт","Газар доорх зогсоол","Хаалттай хороолол","Камер","Зүлэг","Тоглоомын талбай"]},
    { id:"L-2402", title:"4 өрөө дуплекс · Зайсан хайрхан", district:"Хан-Уул", type:"Хаус", rooms:4, area:212, floor:"-", price:1_250_000_000, pricePerM2:5_896_000, year:2021, parking:2, photo:photos[1], photos:7, status:"active", agent:"ag-03", aiScore:88, aiNote:"Үнэ нь зах зээлийн дундажтай дүйцэж байна", verified:true, hot:false, featured:true, shared:false, lat:47.875, lng:106.928, desc:"Зайсангийн хормойд, уулын үзэмжтэй, хувийн хашаатай хаус.", amenities:["Хувийн хашаа","2 машины зогсоол","Гал тогоо","Гэрэлтүүлэг","Хамгаалалт","Терасс"]},
    { id:"L-2403", title:"2 өрөө · Sky City", district:"Сүхбаатар", type:"Орон сууц", rooms:2, area:74, floor:"8/14", price:285_000_000, pricePerM2:3_851_000, year:2020, parking:1, photo:photos[2], photos:5, status:"active", agent:"ag-02", aiScore:92, aiNote:"Зах зээлийн үнээс 8% хямд", verified:true, hot:true, featured:false, shared:true, lat:47.921, lng:106.918},
    { id:"L-2404", title:"1 өрөө студи · MRT хороолол", district:"Баянгол", type:"Орон сууц", rooms:1, area:42, floor:"6/12", price:155_000_000, pricePerM2:3_690_000, year:2019, parking:0, photo:photos[3], photos:3, status:"active", agent:"ag-04", aiScore:84, aiNote:"Үнэ дунджаас 2% дээгүүр", verified:true, hot:false, featured:false, shared:true, lat:47.913, lng:106.881 },
    { id:"L-2405", title:"3 өрөө · Encanto тауэр", district:"Сүхбаатар", type:"Орон сууц", rooms:3, area:96, floor:"15/22", price:435_000_000, pricePerM2:4_531_000, year:2023, parking:1, photo:photos[4], photos:6, status:"active", agent:"ag-01", aiScore:95, aiNote:"Шинэ барилгад зориулсан үнэлгээ маш сайн", verified:true, hot:true, featured:true, shared:true, lat:47.919, lng:106.91 },
    { id:"L-2406", title:"Газар · Богд хан АА", district:"Хан-Уул", type:"Газар", rooms:0, area:780, floor:"-", price:185_000_000, pricePerM2:237_000, year:0, parking:0, photo:photos[5], photos:4, status:"active", agent:"ag-03", aiScore:81, aiNote:"Бараг ижил газрууд 5%-аар үнэтэй", verified:true, hot:false, featured:false, shared:false, lat:47.836, lng:106.92 },
    { id:"L-2407", title:"Оффисын талбай · Central Tower", district:"Сүхбаатар", type:"Оффис", rooms:0, area:215, floor:"18/22", price:1_080_000_000, pricePerM2:5_023_000, year:2018, parking:3, photo:photos[6], photos:5, status:"active", agent:"ag-05", aiScore:78, aiNote:"Үнэ нь дунджаас 6% дээгүүр", verified:false, hot:false, featured:false, shared:false, lat:47.918, lng:106.916 },
    { id:"L-2408", title:"2 өрөө · Гэрэлт хороолол", district:"Чингэлтэй", type:"Орон сууц", rooms:2, area:68, floor:"4/9", price:198_000_000, pricePerM2:2_912_000, year:2015, parking:0, photo:photos[7], photos:4, status:"active", agent:"ag-06", aiScore:71, aiNote:"Хямд үнэ боловч хуурамч магадлал 12%", verified:false, hot:false, featured:false, shared:false, lat:47.928, lng:106.91 },
    { id:"L-2409", title:"3 өрөө · The Mall residence", district:"Сүхбаатар", type:"Орон сууц", rooms:3, area:108, floor:"9/16", price:478_000_000, pricePerM2:4_426_000, year:2021, parking:1, photo:photos[8], photos:6, status:"active", agent:"ag-02", aiScore:90, aiNote:"Үнэ зах зээлтэй нийцэж байна", verified:true, hot:false, featured:true, shared:true, lat:47.917, lng:106.92 },
    { id:"L-2410", title:"Хаус · Их тэнгэр амралт", district:"Хан-Уул", type:"Хаус", rooms:5, area:260, floor:"-", price:1_650_000_000, pricePerM2:6_346_000, year:2022, parking:3, photo:photos[9], photos:9, status:"active", agent:"ag-01", aiScore:93, aiNote:"Лакшери хэсгийн жишиг үнэ", verified:true, hot:true, featured:true, shared:false, lat:47.83, lng:106.94 },
    { id:"L-2411", title:"2 өрөө · Аркэйд хороолол", district:"Баянзүрх", type:"Орон сууц", rooms:2, area:62, floor:"7/14", price:175_000_000, pricePerM2:2_823_000, year:2017, parking:0, photo:photos[10], photos:3, status:"draft", agent:"ag-04", aiScore:79, aiNote:"Зураг нь өөр зартай төстэй (давхардал?)", verified:true, hot:false, featured:false, shared:true, lat:47.91, lng:106.96 },
    { id:"L-2412", title:"Худалдааны талбай · Чингис гудамж", district:"Сүхбаатар", type:"Худалдааны талбай", rooms:0, area:142, floor:"1/5", price:920_000_000, pricePerM2:6_478_000, year:2014, parking:2, photo:photos[11], photos:5, status:"review", agent:"ag-05", aiScore:74, aiNote:"Зах зээлийн үнэлгээ хүсэлт нэмэгдсэн", verified:false, hot:false, featured:false, shared:false, lat:47.92, lng:106.92 },
  ];

  // user (mock logged-in)
  const user = { name:"Б. Энхтуяа", email:"enkhtuya@example.com", avatar:"EB", saved:["L-2401","L-2405","L-2402"], chats:3, viewings:2 };

  // leads (for agent CRM)
  const leads = [
    { id:"LD-901", name:"Г. Хулан", phone:"+976 9911 2222", listing:"L-2401", source:"website", stage:"new", score:92, lastTouch:"2 цаг", note:"3 өрөө шаардаж байна, 500M төсөвтэй" },
    { id:"LD-902", name:"Б. Болдсайхан", phone:"+976 8800 3344", listing:"L-2405", source:"facebook", stage:"contacted", score:78, lastTouch:"6 цаг", note:"Үзэлт зохион байгуулна" },
    { id:"LD-903", name:"Н. Цэвэлмаа", phone:"+976 9999 1111", listing:"L-2410", source:"referral", stage:"viewing", score:88, lastTouch:"Өчигдөр", note:"Гэр бүлийн хамт үзлэг хийсэн" },
    { id:"LD-904", name:"Д. Эрдэнэбат", phone:"+976 9966 7766", listing:"L-2402", source:"instagram", stage:"offer", score:95, lastTouch:"Өнөөдөр", note:"Үнийн санал илгээсэн" },
    { id:"LD-905", name:"А. Уянга", phone:"+976 8800 5544", listing:"L-2403", source:"website", stage:"new", score:64, lastTouch:"30 мин", note:"Хямд хувилбар хайж байна" },
    { id:"LD-906", name:"Т. Билгүүн", phone:"+976 9595 6464", listing:"L-2409", source:"google", stage:"contacted", score:71, lastTouch:"3 өдөр", note:"Дахин залгах" },
  ];

  // chats
  const chats = [
    { id:"c-1", name:"Б. Анхбаяр", office:"Голден Хаус", avatar:"AB", listing:"L-2401", last:"Үзлэг бямба гаригт боломжтой", time:"14:32", unread:1 },
    { id:"c-2", name:"Д. Сэлэнгэ", office:"Urban Realty", avatar:"DS", listing:"L-2405", last:"Тавилгатай хувилбар бий", time:"Өчигдөр", unread:0 },
    { id:"c-3", name:"Н. Энхжаргал", office:"Premium Estate", avatar:"NE", listing:"L-2402", last:"Үнийг 1.2 болгох боломжтой", time:"2 өдрийн өмнө", unread:0 },
  ];

  const messages = [
    { from:"them", text:"Сайн байна уу. River Garden-ийн зарын талаар сонирхож байна гэж байсан.", time:"14:01" },
    { from:"me", text:"Сайн байна уу! Тийм, бямба гаригт үзэх боломжтой юу?", time:"14:18" },
    { from:"them", text:"Бямба гаригийн 11:00 цаг таарч байгаа. Тохирох уу?", time:"14:24" },
    { from:"me", text:"Тохирно. Хаягийг чатанд илгээгээч?", time:"14:30" },
    { from:"them", text:"Олимпийн гудамж, River Garden, 12-р давхар, 1207 тоот. Үзлэг бямба гаригт боломжтой.", time:"14:32" },
  ];

  // viewings
  const viewings = [
    { id:"V-1", listing:"L-2401", agent:"ag-01", date:"2026-05-30", time:"11:00", status:"confirmed" },
    { id:"V-2", listing:"L-2402", agent:"ag-03", date:"2026-06-02", time:"15:30", status:"pending" },
  ];

  // helpers
  const fmtMNT = n => new Intl.NumberFormat('mn-MN').format(n) + "₮";
  const shortMNT = n => {
    if(n>=1e9) return (n/1e9).toFixed(2) + " тэрбум₮";
    if(n>=1e6) return (n/1e6).toFixed(0) + " сая₮";
    return n.toLocaleString('mn-MN')+"₮";
  };
  const agentById = id => agents.find(a => a.id===id);
  const officeByName = n => offices.find(o => o.name===n);
  const listingById = id => listings.find(l => l.id===id);

  return { offices, agents, listings, user, leads, chats, messages, viewings, districts, types, reviewPool, fmtMNT, shortMNT, agentById, officeByName, listingById };
})();
