import { useState } from 'react';
import { motion } from 'framer-motion';
import { SectionHeader } from '../ui/SectionHeader';
import { Accordion } from '../ui/Accordion';
import type { FAQItem } from '../../data/faqs';

interface FAQSectionProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  items: FAQItem[];
}

export function FAQSection({ 
  title = "Questions, answered.", 
  description = "Find the information you need about our energy solutions.",
  items 
}: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="py-24 bg-white border-t border-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader 
          title={title}
          subtitle={description}
        />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
          className="mt-16 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10"
        >
          {items.map((item, index) => (
            <Accordion
              key={index}
              id={`faq-${index}`}
              question={item.question}
              answer={item.answer}
              isOpen={openIndex === index}
              onToggle={() => handleToggle(index)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
