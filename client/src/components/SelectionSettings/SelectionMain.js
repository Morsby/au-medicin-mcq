import React, { Component } from "react";
import { connect } from "react-redux";
import * as actions from "../../actions";

import _ from "lodash";

import {
    Container,
    Header,
    Dropdown,
    Divider,
    Button,
    Message
} from "semantic-ui-react";

import SelectionNSelector from "./SelectionNSelector";
import SelectionSetSelector from "./SelectionSetSelector";
import SelectionSpecialtiesSelector from "./SelectionSpecialtiesSelector";
import SelectionTypeSelector from "./SelectionTypeSelector";
import SelectionMessage from "./SelectionMessage";

import Footer from "../Misc/Footer";
import { default as UIHeader } from "../Misc/Header";

import { semestre, urls } from "../../utils/common";
import { specialer as specialerCommon } from "../../utils/common";
import { selectQuestions } from "../../utils/quiz";

class SelectionMain extends Component {
    state = { err: [] };

    constructor(props) {
        super(props);

        this.onSettingsChange = this.onSettingsChange.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
    }

    onSettingsChange(e, { name, value }) {
        this.setState({ err: [] });
        this.props.changeSettings({ type: name, value });
    }

    handleSubmit(quizType) {
        let err = [];

        let { semester, type, set, questions, specialer } = this.props.settings;

        // VALIDATION
        // Semester
        if (!semester) {
            err.push("Du skal vælge et semester først!");
        }

        //Specialer
        if (type === "specialer" && specialer.length === 0) {
            err.push("Du skal vælge mindst ét speciale.");
        }

        // Sæt
        if (type === "set" && !set) {
            err.push("Du skal vælge et sæt for at kunne starte!");
            if (semester === 11) {
                err.push("You have to select a set to start.");
            }
        }
        // Findes der spørgsmål?
        if (questions.length === 0) {
            err.push("Der er ingen spørgsmål for det valgte semester.");
            if (semester === 11) {
                err.push("There are no questions for the selected semester.");
            }
        }

        // tjek for fejl, start eller ej
        if (err.length === 0) {
            if (quizType === "new") {
                this.props.getQuestions(
                    this.props.settings,
                    selectQuestions(this.props.settings, this.props.user)
                );
            }
            this.props.history.push(urls.quiz);
        } else {
            this.setState({ err });
        }
    }

    render() {
        let {
            semester,
            specialer,
            type,
            n,
            onlyNew,
            questions,
            sets,
            set
        } = this.props.settings;
        let { user } = this.props,
            answeredQuestions;
        if (
            this.props.user &&
            this.props.user.hasOwnProperty("answeredQuestions")
        ) {
            answeredQuestions = user.answeredQuestions[semester];
        }

        // Laver et array af specialer for semesteret
        let uniques = specialerCommon[semester].map(s => s.value);

        // Grupperer de fundne spørgsmål efter specialer
        let questionsBySpecialty = _.countBy(
            // Laver et flat array af alle i spg indeholdte specialer
            _.flattenDeep(questions.map(a => a.specialty)),
            e => {
                return uniques[uniques.indexOf(e)];
            }
        );

        // Tjekker hvor mange der er valgt
        let antalValgte = 0;
        specialer.map(s => {
            let n = questionsBySpecialty[s] ? questionsBySpecialty[s] : 0;
            return (antalValgte = antalValgte + n);
        });

        return (
            <div className="flex-container">
                <UIHeader />
                <Container className="content">
                    <Header as="h1">
                        MCQ'er fra kandidaten på medicin ved Aarhus Universitet
                    </Header>
                    <Header as="h3">Indtast dine valg nedenfor</Header>
                    <Dropdown
                        placeholder="Vælg semester"
                        fluid
                        selection
                        options={semestre}
                        name="semester"
                        value={semester}
                        onChange={this.onSettingsChange}
                    />
                    <Divider hidden />
                    <SelectionTypeSelector
                        handleClick={this.onSettingsChange}
                        type={type}
                    />

                    <Divider hidden />

                    {type !== "set" && (
                        <SelectionNSelector
                            n={n}
                            onlyNew={onlyNew}
                            onChange={this.onSettingsChange}
                            total={questions.length}
                            user={user}
                            semester={semester}
                        />
                    )}

                    {type === "set" && (
                        <SelectionSetSelector
                            questions={questions}
                            sets={sets}
                            activeSet={set}
                            semester={semester}
                            answeredQuestions={answeredQuestions}
                            onChange={this.onSettingsChange}
                        />
                    )}

                    {type === "specialer" && (
                        <SelectionSpecialtiesSelector
                            semester={semester}
                            questions={questions}
                            valgteSpecialer={specialer}
                            antalPerSpeciale={questionsBySpecialty}
                            onChange={this.onSettingsChange}
                        />
                    )}
                    <Divider hidden />

                    {this.state.err.length > 0 && (
                        <Message negative>
                            {this.state.err.map(err => {
                                return <p key={err}>{err}</p>;
                            })}
                        </Message>
                    )}
                    <SelectionMessage user={user} type={type} />
                    <Button
                        onClick={() => this.handleSubmit("new")}
                        disabled={antalValgte < 1 && type === "specialer"}
                    >
                        Start!
                    </Button>
                    {this.props.answers.length > 0 && (
                        <Button onClick={() => this.handleSubmit("cont")}>
                            Fortsæt med igangværende spørgsmål
                        </Button>
                    )}
                </Container>
                <Footer />
            </div>
        );
    }
}

function mapStateToProps(state) {
    return {
        settings: state.settings,
        answers: state.answers,
        user: state.auth.user
    };
}

export default connect(
    mapStateToProps,
    actions
)(SelectionMain);
