export interface FAQItem {
  question: string;
  answer: string;
}

export const homeFaqs: FAQItem[] = [
  {
    question: "What is an Energy Management System (EMS)?",
    answer: "An Energy Management System (EMS) is a comprehensive software and hardware platform that monitors, controls, and optimizes energy usage across various assets like battery storage, solar generation, and site loads."
  },
  {
    question: "How does an EMS manage solar, battery, grid, and loads?",
    answer: "The EMS continuously analyzes telemetry data from all connected assets. It intelligently coordinates charging and discharging cycles, directs solar generation to loads or batteries, and interacts with the grid to maximize efficiency and minimize costs."
  },
  {
    question: "What is StorEDGE?",
    answer: "StorEDGE is GoodEnough Energy's line of Battery Energy Storage Systems (BESS), designed for seamless integration with our intelligent Energy Management System to provide robust and scalable energy solutions."
  },
  {
    question: "Can the EMS support battery storage and solar integration?",
    answer: "Yes, our EMS is explicitly designed to unify battery storage and solar PV integration, creating a cohesive microgrid environment that optimizes renewable energy utilization."
  },
  {
    question: "What types of energy optimization strategies can an EMS support?",
    answer: "An EMS supports various optimization strategies including peak shaving, load shifting, energy arbitrage, and demand response, allowing facilities to reduce peak demand charges and optimize time-of-use tariffs."
  },
  {
    question: "Does the system provide real-time monitoring?",
    answer: "Yes, the GoodEnough Energy EMS provides deep, real-time telemetry, offering instant visibility into state-of-charge, power flows, and asset health."
  }
];

export const emsFaqs: FAQItem[] = [
  {
    question: "What does an EMS do?",
    answer: "An EMS provides the intelligent control layer for an energy ecosystem, automating power routing, monitoring asset health, and executing strategies to reduce energy costs and carbon footprint."
  },
  {
    question: "How does EMS monitor energy systems?",
    answer: "It collects high-frequency telemetry data from inverters, meters, and battery management systems, aggregating it into a centralized dashboard for real-time visibility."
  },
  {
    question: "How can EMS optimize battery charging/discharging?",
    answer: "By analyzing predictive models and grid tariffs, the EMS calculates the optimal times to charge the battery (when energy is cheap or solar is abundant) and discharge it (during peak pricing periods)."
  },
  {
    question: "How does EMS help manage grid dependency?",
    answer: "The EMS dynamically shifts reliance from the grid to onsite stored energy or solar generation during high-demand periods, effectively reducing overall grid dependency and associated costs."
  },
  {
    question: "Can EMS coordinate solar, battery, grid and loads?",
    answer: "Absolutely. The EMS acts as the central brain, dynamically balancing supply from solar and the grid with demand from site loads and battery storage."
  },
  {
    question: "Does EMS support real-time operational visibility?",
    answer: "Yes, it offers comprehensive real-time dashboards and analytics, enabling operators to make informed decisions and verify system performance instantly."
  }
];

export const storedge025Faqs: FAQItem[] = [
  {
    question: "What applications is the StorEDGE 0.25 best suited for?",
    answer: "The StorEDGE 0.25 is designed specifically for commercial and industrial applications, providing reliable backup power and enabling effective peak shaving."
  },
  {
    question: "What is the energy capacity of the StorEDGE 0.25?",
    answer: "The StorEDGE 0.25 features a robust 250 kWh energy capacity."
  },
  {
    question: "What is the power rating of the system?",
    answer: "It operates with a power rating of 125 kVA / kW."
  },
  {
    question: "Does it support renewable integration?",
    answer: "Yes, the StorEDGE 0.25 seamlessly integrates with renewable energy sources like solar PV to maximize green energy utilization."
  },
  {
    question: "Can the StorEDGE 0.25 be used for energy arbitrage?",
    answer: "Yes, when paired with our EMS, the system can store energy when prices are low and discharge when prices are high, enabling effective energy arbitrage."
  }
];

export const storedge50Faqs: FAQItem[] = [
  {
    question: "What scale of projects is the StorEDGE 5.0 designed for?",
    answer: "The StorEDGE 5.0 is engineered for larger-scale energy applications, including utility-scale deployments, microgrids, and large C&I facilities."
  },
  {
    question: "What is the total capacity of the StorEDGE 5.0?",
    answer: "The system offers a massive 5.0 MWh energy capacity."
  },
  {
    question: "What is the power output rating?",
    answer: "The StorEDGE 5.0 delivers 2.5 MVA / MW of power output, providing utility-grade reliability."
  },
  {
    question: "Can the StorEDGE 5.0 provide grid support services?",
    answer: "Yes, its large capacity and intelligent EMS integration make it highly capable of providing grid support and stability services."
  },
  {
    question: "Does it feature intelligent energy dispatch?",
    answer: "Absolutely. The system relies on our advanced EMS to execute precise, intelligent energy dispatch strategies at scale."
  }
];

export const solutionsFaqs: FAQItem[] = [
  {
    question: "What is peak shaving and how does it work?",
    answer: "Peak shaving is the process of reducing the amount of energy purchased from the utility during periods of maximum demand. Our system discharges battery power during these peaks to avoid high demand charges."
  },
  {
    question: "How does the system handle energy optimization?",
    answer: "Through our EMS, the system automatically routes power in the most cost-effective and efficient manner, prioritizing solar, then battery, and minimizing grid usage during peak times."
  },
  {
    question: "Can your solutions integrate with existing solar infrastructure?",
    answer: "Yes, our EMS and BESS solutions are designed to integrate smoothly with existing solar PV systems to capture and store excess generation."
  },
  {
    question: "What role does battery integration play in load management?",
    answer: "Battery integration provides a flexible buffer. It can instantly supply power during sudden load spikes, ensuring site stability and protecting against grid volatility."
  },
  {
    question: "How does the system improve grid management?",
    answer: "By intelligently managing when a site draws power from the grid and when it relies on stored energy, the system reduces strain on the macro-grid and provides operators with greater energy independence."
  }
];
