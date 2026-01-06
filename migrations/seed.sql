-- 插入示例熊猫数据
INSERT INTO pandas (name, gender, birthday, birth_place, current_location, personality, appearance) VALUES
('花花', 'female', '2020-07-04', '成都大熊猫繁育研究基地', '成都大熊猫繁育研究基地', '活泼可爱，喜欢吃苹果和竹子', '毛色黑白分明，圆脸，眼圈较大'),
('和叶', 'male', '2021-06-30', '成都大熊猫繁育研究基地', '成都大熊猫繁育研究基地', '调皮好动，喜欢爬树玩耍', '体型健壮，毛色光亮，行动敏捷'),
('萌兰', 'male', '2015-07-04', '成都大熊猫繁育研究基地', '北京动物园', '聪明机智，喜欢与人互动', '体型较大，表情丰富，被称为"西直门三太子"'),
('福宝', 'female', '2020-07-20', '韩国爱宝乐园', '韩国爱宝乐园', '活泼开朗，喜欢和饲养员玩耍', '毛色洁白，脸型甜美，深受游客喜爱'),
('丫丫', 'female', '2000-08-03', '北京动物园', '北京动物园', '温顺安静，经历过生活磨难', '体型偏瘦，但精神矍铄，充满韧性');

-- 更新亲属关系
UPDATE pandas SET father_id = 3, mother_id = 4 WHERE name IN ('花花', '和叶');

-- 插入熊猫关系
INSERT INTO panda_relationships (panda_id, related_panda_id, relation_type, notes) VALUES
(1, 2, 'sibling', '同父同母的兄弟姐妹'),
(2, 1, 'sibling', '同父同母的兄弟姐妹'),
(3, 4, 'spouse', '在繁育计划中配对'),
(4, 3, 'spouse', '在繁育计划中配对');

-- 插入示例标签
INSERT INTO tags (name, type) VALUES
('吃播', 'behavior'),
('睡觉', 'behavior'),
('爬树', 'behavior'),
('玩耍', 'behavior'),
('可爱', 'appearance'),
('调皮', 'behavior'),
('聪明', 'behavior'),
('温顺', 'behavior'),
('熊猫顶流', 'trend'),
('国际巨星', 'trend');