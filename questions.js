// 10 Анхдагч асуултууд (Default Questions)
const DEFAULT_QUESTIONS = [
  {
    id: 1,
    question: "Дэлхийн хамгийн хурдан хуурай газрын амьтан аль нь вэ?",
    options: ["Ирвэс", "Гепард (Үчимбэр)", "Зээр", "Цөөвөр чоно"],
    correct: 1, // 0-indexed (Гепард)
    time: 20,
    category: "Байгаль, Амьтад"
  },
  {
    id: 2,
    question: "Компьютерийн 'тархи' гэж аль эд ангийг нэрлэдэг вэ?",
    options: ["RAM санах ой", "CPU (Төв процессор)", "Hard Disk (Хатуу диск)", "GPU (График карт)"],
    correct: 1,
    time: 20,
    category: "Мэдээллийн технологи"
  },
  {
    id: 3,
    question: "Нарны аймгийн хамгийн том гараг аль нь вэ?",
    options: ["Бархасбадь (Jupiter)", "Санчир (Saturn)", "Ангараг (Mars)", "Дэлхий (Earth)"],
    correct: 0,
    time: 20,
    category: "Шинжлэх ухаан"
  },
  {
    id: 4,
    question: "Монгол Улсын Үндсэн хуулийн өдөр хэзээ тохиодог вэ?",
    options: ["11-р сарын 26", "1-р сарын 13", "7-р сарын 11", "6-р сарын 1"],
    correct: 1,
    time: 20,
    category: "Түүх, Нийгэм"
  },
  {
    id: 5,
    question: "Шатрын хөлөгт нийт хэдэн дөрвөлжин нүд байдаг вэ?",
    options: ["32 нүд", "48 нүд", "64 нүд", "100 нүд"],
    correct: 2,
    time: 20,
    category: "Спорт, Тоглоом"
  },
  {
    id: 6,
    question: "Дэлхийн хамгийн том далай аль нь вэ?",
    options: ["Номхон далай", "Атлантын далай", "Энэтхэгийн далай", "Хойд мөсөн далай"],
    correct: 0,
    time: 20,
    category: "Газар зүй"
  },
  {
    id: 7,
    question: "Хүний биеийн хамгийн том эрхтэн аль нь вэ?",
    options: ["Элэг", "Тархи", "Арьс", "Зүрх"],
    correct: 2,
    time: 20,
    category: "Анагаах ухаан"
  },
  {
    id: 8,
    question: "Зөгийн бал хэзээ ч мууддаггүй гэдэг үнэн үү?",
    options: ["Тийм (Үнэн)", "Үгүй (Худал)", "1 жилийн дараа мууддаг", "Хөлдөөвөл муудна"],
    correct: 0,
    time: 20,
    category: "Сонирхолтой баримт"
  },
  {
    id: 9,
    question: "Гэрлийн хурд секундэд ойролцоогоор хэдэн км вэ?",
    options: ["30,000 км/сек", "300,000 км/сек", "3,000,000 км/сек", "3,000 км/сек"],
    correct: 1,
    time: 20,
    category: "Физик"
  },
  {
    id: 10,
    question: "Анх саран дээр хөл тавьсан хүн хэн бэ?",
    options: ["Юрий Гагарин", "Илон Маск", "Нил Армстронг", "Базз Олдрин"],
    correct: 2,
    time: 20,
    category: "Сансар судлал"
  }
];

// LocalStorage дээрээс асуултуудыг авах эсвэл шинэчлэх
class QuestionManager {
  static STORAGE_KEY = "kahoot_mgl_questions";

  static getQuestions() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("LocalStorage уншихад алдаа гарлаа:", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_QUESTIONS));
  }

  static saveQuestions(questions) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(questions));
      return true;
    } catch (e) {
      console.error("LocalStorage хадгалахад алдаа гарлаа:", e);
      return false;
    }
  }

  static resetToDefault() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_QUESTIONS));
  }
}
