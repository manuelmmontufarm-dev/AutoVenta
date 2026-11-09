/**
 * Nombres de pila que de verdad se usan en Ecuador, para decidir si la primera
 * palabra del perfil de WhatsApp es un nombre con el que saludar.
 *
 * Una sola forma por nombre y SIN tilde (la comparación quita las tildes de
 * los dos lados: «José» y «jose» son el mismo). Las variantes de escritura
 * comunes van aparte porque en el país conviven (Jhon/John, Geovanny/Giovanni,
 * Kleber/Klever). Lo que no está aquí se saluda sin nombre: dejar de decir
 * «Hola Pedro» a un Pedro raro cuesta nada; decirle «Hola Tapicería» a un
 * negocio, sí (auditoría 9-nov-2026, bloque D).
 *
 * Para agregar uno: minúsculas, sin tilde, en el grupo que corresponda.
 */
const HOMBRES = `
abel abraham adrian agustin alan albert alberto alejandro alex alexander alexis alfonso alfredo alvaro amilcar anderson andre andres angel
anibal anthony antonio ariel armando arnaldo arturo augusto aurelio bairon baltazar bayron benjamin bernardo bladimir bolivar brandon
brayan bryan byron camilo carlos cesar christian cristhian cristian cristobal cleber clever claudio dairo dalton damian dani danilo daniel
dario darwin david denis dennis diego dilan dixon domingo edgar edgardo edison edmundo eduardo edwin efrain elias eliecer emilio
enrique erick erik ernesto esteban estalin eugenio ever ezequiel fabian fabio fabricio fausto federico felipe felix fernando fidel
flavio francisco franco frank franklin freddy fredy gabriel galo gary geovanny geovani gerardo german gilbert giovanni giovanny gonzalo
guido guillermo gustavo harold hector henry herman hernan hernando holger homero hugo humberto ignacio isaac isaias ismael ivan jaime
jair jairo jandry javier joaquin mauro wladimir jefferson jeferson jeison jeremy jeronimo jesus jhon jhonatan jhonny jimmy joel joffre johan johnny jonatan
jonathan jordan jorge jose josue juan julian julio kevin kleber klever lenin leonardo leonel leopoldo lester lorenzo lucas luciano luis
manuel marcelo marco marcos mario mariano martin mateo mauricio maximo mayker michael miguel milton moises nelson nestor nicolas noe
norberto octavio omar orlando oscar osvaldo oswaldo pablo patricio paul paulino paulo pedro rafael ramiro ramon raul reinaldo rene
ricardo richard rigoberto roberto rocky rodolfo rodrigo rogelio roger rolando roman romel ronald ruben rodney salomon samuel santiago
saul sebastian segundo sergio servio silvio simon stalin stefan stephen steven teodoro thomas tito tomas ulises valentin vicente victor
vinicio virgilio vladimir walter washington wellington wilfrido wilmer wilson wilian william willian willy wimer xavier yandry yofre
yuri zacarias
`;

const MUJERES = `
adriana alba alejandra alexandra alicia alison alondra amanda amelia ana andrea angela angelica anita antonella aracely ariana azucena
barbara beatriz belen bertha betty blanca brenda camila carla carlota carmen carolina catalina cecilia celia cinthia clara claudia
cristina cynthia daisy daniela dayana deysi diana digna dolores doris edith elena elisa elizabeth elsa elvia emilia erika estefania
estela esther eugenia eva evelyn fabiola fanny fernanda flor francisca gabriela gladys glenda gloria graciela guadalupe haydee helen
hilda ines irma isabel iveth jackeline jacqueline janeth jazmin jenifer jennifer jenny jessica jimena johana johanna josefina juana
judith julia juliana karen karina karla katherine katerine katty kathy laura leonor leticia lidia liliana lilian linda lisbeth lizbeth
lorena lourdes lucia luisa luz magdalena maite manuela marcela margarita maria mariana maribel marina marisol marta martha mary mayra
mercedes michelle miriam mireya mirian mishel mónica monica myriam nancy narcisa natali natalia nataly nayeli nelly nicole nidia
noemi norma nube olga ofelia paola pamela patricia paulina priscila rebeca regina rocio rosa rosario rosana roxana ruth sabrina sandra
sara sarita sheyla silvia sofia soledad sonia susana tamara tania tatiana teresa valentina valeria vanessa vera veronica victoria
viviana wendy ximena yadira yajaira yesenia yolanda zoila ivonne gissela yessenia joselyn estefany stefany mishell jhoanna
`;

/** Formas cortas y de cariño que la gente pone de nombre de perfil. */
const APODOS = `
chelo chicho coco danny dany fer fercho gaby javi javy lucho luchito macu pepe pepito paco pancho pato patito tony toño
xavi vero beto majo pao vale cris
`;

const sinTildes = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
const palabras = (bloque: string) => bloque.split(/\s+/).filter(Boolean).map((n) => sinTildes(n.toLowerCase()));

const NOMBRES_DE_PILA = new Set([...palabras(HOMBRES), ...palabras(MUJERES), ...palabras(APODOS)]);

/**
 * Los diminutivos («Miguelito», «Fernandita», «Juanchito») se reconocen por su
 * raíz: quitado el sufijo, la raíz con o sin vocal final tiene que ser un
 * nombre de la lista.
 */
const DIMINUTIVO = /^(.{3,}?)(?:it|ill|ic|ch?it)[oa]s?$/;

/** ¿Esta palabra (una sola) es un nombre de pila? */
export function esNombreDePila(palabra: string): boolean {
  const base = sinTildes(palabra.toLowerCase());
  if (NOMBRES_DE_PILA.has(base)) return true;
  const raiz = DIMINUTIVO.exec(base)?.[1];
  if (!raiz) return false;
  return [raiz, `${raiz}o`, `${raiz}a`, `${raiz}e`, `${raiz}os`, `${raiz}as`].some((forma) => NOMBRES_DE_PILA.has(forma));
}
