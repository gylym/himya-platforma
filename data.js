export const AREAS = {
  school: "Мектеп модулі",
  university: "Университет модулі",
  bridge: "Сабақтастық көпірі",
  diagnostic: "Қорытынды диагностика",
};

export const ROLE_LABELS = {
  student: "Оқушы",
  university_student: "Студент",
  admin: "Әкімші",
};

export const DEFAULT_CONTENT = [
  { id:"school-root", area:"school", parent_id:null, title:"Мектеп модулі", path:"/mektep", body:"", sort_order:0, is_published:true },
  { id:"school-program", area:"school", parent_id:"school-root", title:"Оқу бағдарламасы – 7–11 сынып", path:"/mektep/oku-bagdarlamasy", body:"", sort_order:0, is_published:true },
  { id:"school-theory", area:"school", parent_id:"school-root", title:"Теориялық бөлім", path:"/mektep/teoriya", body:"", sort_order:1, is_published:true },
  { id:"grade-7", area:"school", parent_id:"school-theory", title:"7-сынып", path:"/mektep/teoriya/7-synyp", body:"", sort_order:0, is_published:true },
  { id:"grade-8", area:"school", parent_id:"school-theory", title:"8-сынып", path:"/mektep/teoriya/8-synyp", body:"", sort_order:1, is_published:true },
  { id:"grade-9", area:"school", parent_id:"school-theory", title:"9-сынып", path:"/mektep/teoriya/9-synyp", body:"", sort_order:2, is_published:true },
  { id:"grade-10", area:"school", parent_id:"school-theory", title:"10-сынып", path:"/mektep/teoriya/10-synyp", body:"", sort_order:3, is_published:true },
  { id:"grade-11", area:"school", parent_id:"school-theory", title:"11-сынып", path:"/mektep/teoriya/11-synyp", body:"", sort_order:4, is_published:true },
  { id:"school-profile", area:"school", parent_id:"school-root", title:"Жалпы және бейін", path:"/mektep/zhalpy-zhane-beyin", body:"", sort_order:2, is_published:true },
  { id:"school-ubt", area:"school", parent_id:"school-root", title:"ҰБТ-ға дайындық", path:"/mektep/ubt", body:"", sort_order:3, is_published:true },
  { id:"school-map", area:"school", parent_id:"school-root", title:"Оқушының білім картасы", path:"/mektep/bilim-kartasy", body:"", sort_order:4, is_published:true },
  { id:"university-root", area:"university", parent_id:null, title:"Университет модулі", path:"/universitet", body:"", sort_order:1, is_published:true },
  { id:"university-syllabus", area:"university", parent_id:"university-root", title:"Силлабус", path:"/universitet/sillabus", body:"", sort_order:0, is_published:true },
  { id:"university-theory", area:"university", parent_id:"university-root", title:"Теория", path:"/universitet/teoriya", body:"", sort_order:1, is_published:true },
  { id:"university-self", area:"university", parent_id:"university-root", title:"Өзін-өзі дайындау", path:"/universitet/ozin-ozi-daiyndau", body:"", sort_order:2, is_published:true },
  { id:"university-map", area:"university", parent_id:"university-root", title:"Студенттің білім картасы", path:"/universitet/bilim-kartasy", body:"", sort_order:3, is_published:true },
  { id:"bridge-root", area:"bridge", parent_id:null, title:"Сабақтастық көпірі", path:"/sabaktastyk-kopiri", body:"", sort_order:2, is_published:true },
  { id:"bridge-equivalent", area:"bridge", parent_id:"bridge-root", title:"Эквивалент ұғымы", path:"/sabaktastyk-kopiri/ekvivalent-ugymy", body:"", sort_order:0, is_published:true },
  { id:"bridge-bond", area:"bridge", parent_id:"bridge-root", title:"Химиялық байланыс", path:"/sabaktastyk-kopiri/himiyalyk-bailanys", body:"", sort_order:1, is_published:true },
  { id:"bridge-redox", area:"bridge", parent_id:"bridge-root", title:"Тотығу-тотықсыздану реакциялары", path:"/sabaktastyk-kopiri/totygu-totyksyzdanu", body:"", sort_order:2, is_published:true },
  { id:"bridge-solutions", area:"bridge", parent_id:"bridge-root", title:"Ерітінділер", path:"/sabaktastyk-kopiri/eritindiler", body:"", sort_order:3, is_published:true },
  { id:"bridge-complex", area:"bridge", parent_id:"bridge-root", title:"Комплексті қасиеттер", path:"/sabaktastyk-kopiri/kompleksti-kasietter", body:"", sort_order:4, is_published:true },
  { id:"diagnostic-root", area:"diagnostic", parent_id:null, title:"Қорытынды диагностика", path:"/korytyndy-diagnostika", body:"", sort_order:3, is_published:true },
];
